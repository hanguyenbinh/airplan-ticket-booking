import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from './mocks/server'
import { searchFlights, createBooking } from '@/lib/api'

describe('api client', () => {
  it('searchFlights maps from/to to origin/destination query params', async () => {
    let capturedUrl = ''
    server.use(
      http.get('http://localhost:5173/api/search/flights', ({ request }) => {
        capturedUrl = request.url
        return HttpResponse.json({
          data: [],
          total: 0,
          page: 1,
          limit: 20,
          totalPages: 0,
        })
      }),
    )

    await searchFlights({ from: 'SGN', to: 'HAN' })
    const u = new URL(capturedUrl)
    expect(u.searchParams.get('origin')).toBe('SGN')
    expect(u.searchParams.get('destination')).toBe('HAN')
  })

  it('searchFlights returns SearchResult shape', async () => {
    const res = await searchFlights({ from: 'SGN' })
    expect(res.data).toBeDefined()
    expect(Array.isArray(res.data)).toBe(true)
    expect(res.total).toBe(1)
  })

  it('createBooking sends POST JSON body', async () => {
    let body: Record<string, unknown> = {}
    server.use(
      http.post('http://localhost:5173/api/bookings', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({
          id: '00000000-0000-4000-8000-00000000c001',
          flightId: body.flightId,
          seatNo: body.seatNo,
          passengerName: body.passengerName,
          totalAmount: body.totalAmount,
          status: 'INITIATED',
          sagaState: { step: 'STARTED' },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      }),
    )

    const dto = {
      flightId: '00000000-0000-4000-8000-000000000099',
      seatNo: '10A',
      passengerName: 'A',
      totalAmount: 100,
    }
    const b = await createBooking(dto)
    expect(body).toMatchObject(dto)
    expect(b.id).toBeDefined()
  })
})
