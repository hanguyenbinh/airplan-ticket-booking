/**
 * Elasticsearch Seed — 1000 flight documents
 *
 * Usage:
 *   node 04-elasticsearch-seed.js
 *
 * Requires: Elasticsearch running on localhost:9200
 * (or set ES_URL env variable)
 *
 * The script uses the built-in `http` module — no npm install needed.
 */

'use strict';

const http = require('http');

const ES_URL = process.env.ES_URL ?? 'http://localhost:9200';
const INDEX  = 'flights';

// ─── Reference data ──────────────────────────────────────────────────────────

const ROUTES = [
  { origin: 'SGN', dest: 'HAN', durationMin: 130, basePrice: 850000 },
  { origin: 'HAN', dest: 'SGN', durationMin: 130, basePrice: 850000 },
  { origin: 'SGN', dest: 'DAD', durationMin:  75, basePrice: 550000 },
  { origin: 'DAD', dest: 'SGN', durationMin:  75, basePrice: 550000 },
  { origin: 'HAN', dest: 'DAD', durationMin:  70, basePrice: 520000 },
  { origin: 'DAD', dest: 'HAN', durationMin:  70, basePrice: 520000 },
  { origin: 'SGN', dest: 'PQC', durationMin:  65, basePrice: 480000 },
  { origin: 'PQC', dest: 'SGN', durationMin:  65, basePrice: 480000 },
  { origin: 'SGN', dest: 'DLI', durationMin:  60, basePrice: 430000 },
  { origin: 'DLI', dest: 'SGN', durationMin:  60, basePrice: 430000 },
];

const AIRLINES = [
  { code: 'VN', name: 'Vietnam Airlines', totalSeats: 150 },
  { code: 'VJ', name: 'VietJet Air',      totalSeats: 180 },
  { code: 'QH', name: 'Bamboo Airways',   totalSeats: 162 },
  { code: 'BL', name: 'Pacific Airlines', totalSeats: 160 },
];

// 10 departure slots per day (06:00 → 21:00, every 90 min)
const DEPARTURE_HOURS   = [6, 7, 9, 10, 12, 13, 15, 17, 19, 21];
const DEPARTURE_MINUTES = [0, 30, 0, 45, 0, 30, 0, 0, 0, 15];

// Base date: 2025-12-01
const BASE_DATE = new Date('2025-12-01T00:00:00+07:00');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function flightId(n) {
  return `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60_000);
}

function calcPrice(basePrice, booked, total) {
  const occ = booked / total;
  let mult = 1.0;
  if (occ >= 0.8)      mult = 2.0;
  else if (occ >= 0.6) mult = 1.5;
  else if (occ >= 0.3) mult = 1.2;
  return Math.round((basePrice * mult) / 1000) * 1000;
}

// ─── Generate 1000 documents ─────────────────────────────────────────────────

const docs = [];

for (let n = 1; n <= 1000; n++) {
  const route   = ROUTES[(n - 1) % ROUTES.length];
  const airline = AIRLINES[(n - 1) % AIRLINES.length];
  const slotIdx = (n - 1) % DEPARTURE_HOURS.length;
  const dayIdx  = Math.floor((n - 1) / (ROUTES.length * AIRLINES.length));

  const depDate = new Date(BASE_DATE);
  depDate.setDate(depDate.getDate() + dayIdx);
  depDate.setHours(DEPARTURE_HOURS[slotIdx], DEPARTURE_MINUTES[slotIdx], 0, 0);

  const arrDate = addMinutes(depDate, route.durationMin);

  const totalSeats  = airline.totalSeats;
  const bookedSeats = n % totalSeats;
  const available   = totalSeats - bookedSeats;
  const price       = calcPrice(route.basePrice, bookedSeats, totalSeats);

  // flightNo: e.g. VN100, VJ203 ...
  const flightNo = `${airline.code}${100 + ((n - 1) % 900)}`;

  docs.push({
    flightId:       flightId(n),
    flightNo,
    airline:        airline.name,
    origin:         route.origin,
    destination:    route.dest,
    departureAt:    depDate.toISOString(),
    arrivalAt:      arrDate.toISOString(),
    price,
    currency:       'VND',
    availableSeats: available,
    totalSeats,
  });
}

// ─── Build ndjson bulk body ───────────────────────────────────────────────────

function buildNdjson(documents) {
  const lines = [];
  for (const doc of documents) {
    lines.push(JSON.stringify({ index: { _index: INDEX, _id: doc.flightId } }));
    lines.push(JSON.stringify(doc));
  }
  return lines.join('\n') + '\n';
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function request(method, path, body, contentType = 'application/json') {
  return new Promise((resolve, reject) => {
    const url   = new URL(path, ES_URL);
    const data  = body == null ? '' : (typeof body === 'string' ? body : JSON.stringify(body));

    const req = http.request(
      { hostname: url.hostname, port: url.port || 9200, path: url.pathname, method,
        headers: { 'Content-Type': contentType, 'Content-Length': Buffer.byteLength(data) } },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
          catch { resolve({ status: res.statusCode, body: raw }); }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Connecting to Elasticsearch at ${ES_URL} …`);

  // 1. Delete old index if exists
  const del = await request('DELETE', `/${INDEX}`);
  if (del.status === 200) console.log(`Deleted existing index '${INDEX}'`);

  // 2. Create index with mapping
  const mapping = {
    mappings: {
      properties: {
        flightId:       { type: 'keyword' },
        flightNo:       { type: 'keyword' },
        airline:        { type: 'text', fields: { keyword: { type: 'keyword' } } },
        origin:         { type: 'keyword' },
        destination:    { type: 'keyword' },
        departureAt:    { type: 'date' },
        arrivalAt:      { type: 'date' },
        price:          { type: 'double' },
        currency:       { type: 'keyword' },
        availableSeats: { type: 'integer' },
        totalSeats:     { type: 'integer' },
      },
    },
  };
  const create = await request('PUT', `/${INDEX}`, mapping);
  console.log(`Created index '${INDEX}': HTTP ${create.status}`);

  // 3. Bulk insert in batches of 100 docs each
  const BATCH = 100;
  for (let i = 0; i < docs.length; i += BATCH) {
    const batch  = docs.slice(i, i + BATCH);
    const ndjson = buildNdjson(batch);
    const res    = await request('POST', '/_bulk', ndjson, 'application/x-ndjson');

    if (res.body.errors) {
      const errs = res.body.items.filter((it) => it.index?.error);
      console.error(`Batch ${i / BATCH + 1}: ${errs.length} errors`, errs[0]?.index?.error);
    } else {
      console.log(`Batch ${i / BATCH + 1}/${Math.ceil(docs.length / BATCH)}: ✓ inserted ${batch.length} docs`);
    }
  }

  // 4. Final count
  await new Promise((r) => setTimeout(r, 1000)); // wait for refresh
  const count = await request('GET', `/${INDEX}/_count`);
  console.log(`\n✅ Done! Total documents in '${INDEX}': ${count.body.count}`);

  // 5. Sample search
  const sample = await request('POST', `/${INDEX}/_search`, {
    size: 3,
    sort: [{ price: 'asc' }],
    query: { term: { origin: 'SGN' } },
  });
  console.log('\nSample: 3 cheapest flights from SGN:');
  sample.body.hits.hits.forEach((h) => {
    const f = h._source;
    console.log(`  ${f.flightNo}  ${f.origin}→${f.destination}  ${f.departureAt.slice(0,16)}  ${f.price.toLocaleString()} VND  (${f.availableSeats} seats left)`);
  });
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
