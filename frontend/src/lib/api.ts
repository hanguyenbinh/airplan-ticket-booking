const BASE = '/api'

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + url, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(err.message ?? 'Request failed')
  }
  return res.json()
}

// ── Search ──────────────────────────────────────────────────────────────────

export interface Flight {
  flightId: string
  flightNo: string
  airline: string
  origin: string
  destination: string
  departureAt: string
  arrivalAt: string
  price: number
  currency: string
  availableSeats: number
  totalSeats: number
}

export interface SearchParams {
  from?: string
  to?: string
  date?: string
  minPrice?: number
  maxPrice?: number
  passengers?: number
  page?: number
  limit?: number
}

export interface SearchResult {
  total: number
  totalPages: number
  page: number
  limit: number
  data: Flight[]   // backend field is "data", not "hits"
}

export const searchFlights = (params: SearchParams) => {
  const q = new URLSearchParams()
  if (params.from)       q.set('origin', params.from)         // controller uses "origin"
  if (params.to)         q.set('destination', params.to)      // controller uses "destination"
  if (params.date)       q.set('date', params.date)
  if (params.minPrice)   q.set('minPrice', String(params.minPrice))
  if (params.maxPrice)   q.set('maxPrice', String(params.maxPrice))
  if (params.passengers) q.set('passengers', String(params.passengers))
  if (params.page)       q.set('page', String(params.page))
  if (params.limit)      q.set('limit', String(params.limit))
  return http<SearchResult>(`/search/flights?${q}`)
}

// ── Bookings ─────────────────────────────────────────────────────────────────

export type BookingStatus =
  | 'INITIATED' | 'SEAT_LOCKED' | 'PAYMENT_PROCESSING'
  | 'CONFIRMED' | 'FAILED' | 'CANCELLED'

export interface Booking {
  id: string
  flightId: string
  seatNo: string
  passengerName: string
  totalAmount: number
  status: BookingStatus
  sagaState: { step: string; lockToken?: string; error?: string } | null
  createdAt: string
  updatedAt: string
}

export interface CreateBookingDto {
  flightId: string
  seatNo: string
  passengerName: string
  totalAmount: number
}

export const createBooking = (dto: CreateBookingDto) =>
  http<Booking>('/bookings', { method: 'POST', body: JSON.stringify(dto) })

export const getBooking = (id: string) =>
  http<Booking>(`/bookings/${id}`)

export const getAllBookings = () =>
  http<Booking[]>('/bookings')

// ── Inventory ─────────────────────────────────────────────────────────────────

export type SeatStatus = 'AVAILABLE' | 'LOCKED' | 'BOOKED'

export interface Seat {
  id: string
  flightId: string
  seatNo: string
  status: SeatStatus
  lockToken: string | null
  lockedByBookingId: string | null
  lockExpiresAt: string | null
  version: number
}

export const getFlightSeats = (flightId: string) =>
  http<Seat[]>(`/inventory/flights/${flightId}/seats`)

// ── Pricing ──────────────────────────────────────────────────────────────────

export interface FlightPrice {
  flightId: string
  basePrice: number
  currentPrice: number
  bookedSeats: number
  totalSeats: number
  updatedAt: string
}

export const getFlightPrice = (flightId: string) =>
  http<FlightPrice>(`/pricing/prices/${flightId}`)
