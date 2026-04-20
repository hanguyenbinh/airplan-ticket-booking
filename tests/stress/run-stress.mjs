#!/usr/bin/env node
/**
 * HTTP stress runner against the airline ingress (or direct URLs).
 *
 * Logs every failure to stderr and appends JSON lines to STRESS_LOG_FILE (default: stress-errors.log).
 *
 * Usage:
 *   node tests/stress/run-stress.mjs
 *   STRESS_BASE_URL=http://airline.local STRESS_REQUESTS=2000 STRESS_CONCURRENCY=40 node tests/stress/run-stress.mjs
 *
 * Env:
 *   STRESS_BASE_URL     — default http://airline.local
 *   STRESS_REQUESTS     — total requests (default 1000)
 *   STRESS_CONCURRENCY  — in-flight cap (default 30)
 *   STRESS_LOG_FILE     — error log path (default ./stress-errors.log in cwd)
 *   STRESS_INCLUDE_BOOKINGS — if "1", some requests POST /api/bookings (default 0; heavy on Kafka/DB)
 *   STRESS_FETCH_CONNECTIONS — max TCP connections per origin for the stress client (default = STRESS_CONCURRENCY).
 *     Node's built-in fetch() caps per-host connections (~256); high STRESS_CONCURRENCY without this causes
 *     "fetch failed" on the client. Run `npm install` in tests/stress/ so this script can use undici's Agent.
 *   STRESS_FORCE_CLOSE  — if "1" (default), send "Connection: close" on every request and disable undici
 *     keep-alive. This flips TCP so the SERVER calls close() first and lands in TIME_WAIT; the Windows
 *     client socket then goes straight to CLOSED and frees the ephemeral port immediately, avoiding
 *     EADDRINUSE on 127.0.0.1 under high concurrency. Set to "0" to reuse connections (faster RPS, but
 *     expect port exhaustion on Windows > ~16k).
 *
 *   Booking POST 409 Conflict (seat cache / not available) is treated as success: not logged, not counted as fail.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Agent, fetch as undiciFetch } from 'undici'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const BASE = process.env.STRESS_BASE_URL ?? 'http://airline.local'
const TOTAL = Math.max(1, Number(process.env.STRESS_REQUESTS ?? 100000))
const CONCURRENCY = Math.max(1, Number(process.env.STRESS_CONCURRENCY ?? 30))
const LOG_FILE = path.resolve(process.env.STRESS_LOG_FILE ?? path.join(__dirname, 'stress-errors.log'))
const INCLUDE_BOOKINGS = process.env.STRESS_INCLUDE_BOOKINGS === '1'
const FORCE_CLOSE = (process.env.STRESS_FORCE_CLOSE ?? '1') === '1'

/** Per-origin connection cap for the client; must be >= concurrency or Node/undici queues and may error under load. */
const FETCH_CONNECTIONS = Math.max(
  CONCURRENCY,
  Number(process.env.STRESS_FETCH_CONNECTIONS ?? CONCURRENCY),
)

/**
 * When FORCE_CLOSE is on:
 *  - pipelining=0 disables HTTP/1.1 keep-alive pooling in undici.
 *  - keepAliveTimeout=1ms so any residual socket is torn down immediately after the response.
 *  - Combined with the "Connection: close" request header below, the server emits FIN first;
 *    the client's ephemeral port does NOT enter TIME_WAIT and is reusable straight away.
 */
const stressAgent = new Agent(
  FORCE_CLOSE
    ? {
        connections: Math.min(16384, FETCH_CONNECTIONS),
        pipelining: 0,
        keepAliveTimeout: 1,
        keepAliveMaxTimeout: 1,
      }
    : {
        connections: Math.min(16384, FETCH_CONNECTIONS),
        pipelining: 1,
      },
)

// RFC UUID v4 (matches infra/seeds + @IsUUID() on booking); old f1a2b3c4-* IDs fail validation.
const FLIGHT_A = '00000001-0000-4000-8000-000000000001'
const FLIGHT_B = '00000002-0000-4000-8000-000000000002'

function pickScenario(i) {
  const r = i % (INCLUDE_BOOKINGS ? 5 : 4)
  if (r === 0) return { name: 'search', method: 'GET', path: '/api/search/flights?origin=SGN&destination=HAN&limit=10' }
  if (r === 1) return { name: 'inventory_seats', method: 'GET', path: `/api/inventory/flights/${FLIGHT_A}/seats` }
  if (r === 2) return { name: 'pricing', method: 'GET', path: `/api/pricing/prices/${FLIGHT_A}` }
  if (r === 3) return { name: 'inventory_seats_b', method: 'GET', path: `/api/inventory/flights/${FLIGHT_B}/seats` }
  const row = (i % 25) + 1
  const col = ['A', 'B', 'C', 'D', 'E', 'F'][Math.floor(i / 25) % 6]
  return {
    name: 'booking_post',
    method: 'POST',
    path: '/api/bookings',
    body: JSON.stringify({
      flightId: FLIGHT_A,
      seatNo: `${String(row).padStart(2, '0')}${col}`,
      passengerName: `Stress ${i}`,
      totalAmount: 850000,
    }),
  }
}

/** Expected under load: cache rejected duplicate seat — do not log or fail the run. */
function isIgnoredBookingSeatConflict(scenarioName, status, body) {
  if (scenarioName !== 'booking_post' || status !== 409) return false
  const s = typeof body === 'string' ? body : ''
  return (
    /not available for this flight/i.test(s) ||
    /locked in cache or not available/i.test(s)
  )
}

function logError(entry) {
  const line = JSON.stringify(entry) + '\n'
  const statusOrPhase =
    entry.status != null ? String(entry.status) : `[${entry.phase ?? 'error'}]`
  const extra = entry.causeMessage ? ` cause=${String(entry.causeMessage).slice(0, 120)}` : ''
  console.error('[stress:error]', entry.scenario, statusOrPhase, (entry.message?.slice?.(0, 200) ?? '') + extra)
  try {
    fs.appendFileSync(LOG_FILE, line, 'utf8')
  } catch (e) {
    console.error('[stress] failed to append log file:', e.message)
  }
}

async function oneRequest(seq) {
  const scenario = pickScenario(seq)
  const url = new URL(scenario.path, BASE)
  const t0 = performance.now()
  const init = {
    method: scenario.method,
    headers: { Accept: 'application/json' },
  }
  if (FORCE_CLOSE) {
    // Server closes socket after the response → server takes TIME_WAIT, not the Windows client.
    init.headers.Connection = 'close'
  }
  if (scenario.method === 'POST') {
    init.headers['Content-Type'] = 'application/json'
    init.body = scenario.body
  }
  let res
  try {
    res = await undiciFetch(url, { ...init, dispatcher: stressAgent })
    // IMPORTANT: fully drain the response body BEFORE returning.
    //   - With "Connection: close", undici closes the socket as soon as the body stream reaches EOF,
    //     which releases the client's ephemeral port right after the response is fully received.
    //   - Cancelling early (res.body.cancel()) would abort with RST and can leave the port in TIME_WAIT.
    //   - Leaving the body unread keeps the stream (and the socket) alive until GC → port stays held.
    // Drain to EOF for 2xx; the !res.ok branch below reads body itself.
    if (res.ok) {
      // discard content — we only care about hitting EOF so the socket closes cleanly.
      await res.arrayBuffer()
    }
  } catch (err) {
    const cause = err?.cause
    logError({
      ts: new Date().toISOString(),
      seq,
      scenario: scenario.name,
      phase: 'network',
      message: err?.message ?? String(err),
      causeMessage: cause?.message ?? (cause != null ? String(cause) : undefined),
      stack: err?.stack,
    })
    return { ok: false, ms: performance.now() - t0 }
  }
  const ms = performance.now() - t0
  if (!res.ok) {
    let body = ''
    try {
      body = (await res.text()).slice(0, 2000)
    } catch {
      body = '<unreadable>'
    }
    if (isIgnoredBookingSeatConflict(scenario.name, res.status, body)) {
      return { ok: true, ms }
    }
    logError({
      ts: new Date().toISOString(),
      seq,
      scenario: scenario.name,
      phase: 'http',
      status: res.status,
      url: String(url),
      message: body,
      ms,
    })
    return { ok: false, ms }
  }
  return { ok: true, ms }
}

async function runPool(total, concurrency) {
  let next = 0
  let successes = 0
  let failures = 0
  const latencies = []

  async function worker() {
    for (;;) {
      const seq = next++
      if (seq >= total) return
      const r = await oneRequest(seq)
      if (r.ok) {
        successes++
        latencies.push(r.ms)
      } else {
        failures++
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker())
  await Promise.all(workers)

  latencies.sort((a, b) => a - b)
  const p50 = latencies[Math.floor(latencies.length * 0.5)] ?? 0
  const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0

  return { successes, failures, p50, p95, latencies }
}

async function main() {
  try {
    console.log(
      '[stress] base=',
      BASE,
      'requests=',
      TOTAL,
      'concurrency=',
      CONCURRENCY,
      'fetchConnections=',
      FETCH_CONNECTIONS,
      'bookings=',
      INCLUDE_BOOKINGS,
      'forceClose=',
      FORCE_CLOSE,
    )
    console.log('[stress] error log=', LOG_FILE)

    const t0 = performance.now()
    const { successes, failures, p50, p95 } = await runPool(TOTAL, CONCURRENCY)
    const wall = (performance.now() - t0) / 1000

    console.log('[stress] done in', wall.toFixed(2), 's')
    console.log('[stress] ok=', successes, 'fail=', failures, 'rps=', (TOTAL / wall).toFixed(1))
    console.log('[stress] latency ms p50=', p50.toFixed(1), 'p95=', p95.toFixed(1))

    if (failures > 0) {
      console.error('[stress] see', LOG_FILE, 'for', failures, 'error line(s)')
      process.exitCode = 1
    }
  } finally {
    await stressAgent.close()
  }
}

main().catch((e) => {
  console.error('[stress:fatal]', e)
  logError({ ts: new Date().toISOString(), scenario: 'runner', phase: 'fatal', message: e?.message, stack: e?.stack })
  process.exit(1)
})
