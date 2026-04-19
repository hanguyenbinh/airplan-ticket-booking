import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

const mockFlight = {
  flightId: '00000000-0000-4000-8000-0000000000f1',
  flightNo: 'VN100',
  airline: 'Vietnam Airlines',
  origin: 'SGN',
  destination: 'HAN',
  departureAt: '2025-12-20T06:00:00+07:00',
  arrivalAt: '2025-12-20T08:10:00+07:00',
  price: 850000,
  currency: 'VND',
  availableSeats: 149,
  totalSeats: 150,
}

const origin = 'http://localhost:5173'

export const server = setupServer(
  http.get(`${origin}/api/search/flights`, ({ request }) => {
    const url = new URL(request.url)
    const page = Number(url.searchParams.get('page') ?? '1')
    const limit = Number(url.searchParams.get('limit') ?? '20')

    return HttpResponse.json({
      data: [mockFlight],
      total: 1,
      page,
      limit,
      totalPages: 1,
    })
  }),

  http.get(`${origin}/api/inventory/flights/:flightId/seats`, () => HttpResponse.json([])),

  http.get(`${origin}/api/bookings/:id`, ({ params }) => {
    const id = params.id as string
    return HttpResponse.json({
      id,
      flightId: mockFlight.flightId,
      seatNo: '01A',
      passengerName: 'P',
      totalAmount: 850000,
      status: 'INITIATED',
      sagaState: { step: 'STARTED' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  }),

  http.post(`${origin}/api/bookings`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json({
      id: '00000000-0000-4000-8000-00000000b001',
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
