import { useState, useEffect, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, RefreshCw, Search } from 'lucide-react'
import { getBooking, type Booking, type BookingStatus } from '@/lib/api'
import { formatVND, formatDateTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const STATUS_CONFIG: Record<BookingStatus, { label: string; variant: 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline'; desc: string }> = {
  INITIATED:          { label: 'Initiated',          variant: 'secondary', desc: 'Booking received, processing...' },
  SEAT_LOCKED:        { label: 'Seat Locked',        variant: 'warning',   desc: 'Seat reserved, confirming payment...' },
  PAYMENT_PROCESSING: { label: 'Payment Processing', variant: 'warning',   desc: 'Processing payment...' },
  CONFIRMED:          { label: 'Confirmed ✓',        variant: 'success',   desc: 'Your booking is confirmed!' },
  FAILED:             { label: 'Failed',             variant: 'destructive', desc: 'Booking could not be completed.' },
  CANCELLED:          { label: 'Cancelled',          variant: 'outline',   desc: 'This booking was cancelled.' },
}

const STEPS: BookingStatus[] = ['INITIATED', 'SEAT_LOCKED', 'PAYMENT_PROCESSING', 'CONFIRMED']

export default function TrackPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [inputId, setInputId] = useState(location.state?.bookingId ?? '')
  const [bookingId, setBookingId] = useState(location.state?.bookingId ?? '')
  const [booking, setBooking] = useState<Booking | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const fetchBooking = useCallback(async (id: string) => {
    if (!id) return
    setLoading(true); setError('')
    try {
      const data = await getBooking(id)
      setBooking(data)
      setLastRefresh(new Date())
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (bookingId) fetchBooking(bookingId)
  }, [bookingId, fetchBooking])

  // Auto-refresh every 5s while in-progress
  useEffect(() => {
    if (!booking) return
    const inProgress = ['INITIATED', 'SEAT_LOCKED', 'PAYMENT_PROCESSING'].includes(booking.status)
    if (!inProgress) return
    const timer = setInterval(() => fetchBooking(bookingId), 5000)
    return () => clearInterval(timer)
  }, [booking, bookingId, fetchBooking])

  const cfg = booking ? STATUS_CONFIG[booking.status] : null
  const stepIdx = booking ? STEPS.indexOf(booking.status) : -1

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 py-4">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-semibold">Track Booking</h1>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-6 space-y-4">
        {/* Search input */}
        <Card>
          <CardContent className="pt-4">
            <div className="space-y-1">
              <Label>Booking ID</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. 550e8400-e29b-41d4-a716-..."
                  value={inputId}
                  onChange={e => setInputId(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && setBookingId(inputId)}
                />
                <Button onClick={() => setBookingId(inputId)} disabled={!inputId}>
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {error && <p className="text-sm text-red-500 text-center">{error}</p>}

        {loading && !booking && (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          </div>
        )}

        {booking && cfg && (
          <>
            {/* Status card */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Booking Status</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => fetchBooking(bookingId)} disabled={loading}>
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <Badge variant={cfg.variant} className="text-sm px-3 py-1">{cfg.label}</Badge>
                  <span className="text-sm text-gray-500">{cfg.desc}</span>
                </div>

                {/* Progress bar */}
                {booking.status !== 'FAILED' && booking.status !== 'CANCELLED' && (
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      {STEPS.map((s, i) => (
                        <div key={s} className="flex flex-col items-center gap-1">
                          <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold
                            ${i <= stepIdx ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-400'}`}>
                            {i < stepIdx ? '✓' : i + 1}
                          </div>
                          <span className="text-xs text-gray-400 text-center hidden sm:block">
                            {STATUS_CONFIG[s].label.replace(' ✓', '')}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="relative h-1.5 rounded bg-gray-200">
                      <div
                        className="absolute h-1.5 rounded bg-blue-600 transition-all"
                        style={{ width: `${stepIdx >= 0 ? (stepIdx / (STEPS.length - 1)) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                )}

                {lastRefresh && (
                  <p className="text-xs text-gray-400">
                    Last updated: {lastRefresh.toLocaleTimeString()}
                    {['INITIATED', 'SEAT_LOCKED', 'PAYMENT_PROCESSING'].includes(booking.status) && ' · Auto-refreshing…'}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Details */}
            <Card>
              <CardHeader><CardTitle>Booking Details</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <Row label="Booking ID" value={<span className="font-mono text-xs break-all">{booking.id}</span>} />
                  <Row label="Passenger" value={booking.passengerName} />
                  <Row label="Seat" value={booking.seatNo} />
                  <Row label="Amount" value={<span className="font-semibold text-blue-700">{formatVND(booking.totalAmount)}</span>} />
                  <Row label="Created" value={formatDateTime(booking.createdAt)} />
                  <Row label="Updated" value={formatDateTime(booking.updatedAt)} />
                  {booking.sagaState?.error && (
                    <Row label="Error" value={<span className="text-red-500">{booking.sagaState.error}</span>} />
                  )}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  )
}
