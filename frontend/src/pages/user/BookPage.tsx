import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plane, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { createBooking, getFlightSeats, type Flight, type Seat } from '@/lib/api'
import { formatVND, formatDateTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

type Step = 'form' | 'seats' | 'confirm' | 'done' | 'error'

export default function BookPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const flight = location.state?.flight as Flight | undefined

  const [step, setStep] = useState<Step>('form')
  const [name, setName] = useState('')
  const [seats, setSeats] = useState<Seat[]>([])
  const [selectedSeat, setSelectedSeat] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [booking, setBooking] = useState<{ id: string; status: string } | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  if (!flight) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="mb-4 text-gray-500">No flight selected.</p>
          <Button onClick={() => navigate('/')}>Back to Search</Button>
        </div>
      </div>
    )
  }

  const loadSeats = async () => {
    if (!name.trim()) return
    setLoading(true)
    try {
      const data = await getFlightSeats(flight.flightId)
      setSeats(data)
      setStep('seats')
    } catch (e: any) {
      setErrorMsg(e.message)
      setStep('error')
    } finally {
      setLoading(false)
    }
  }

  const handleBook = async () => {
    if (!selectedSeat) return
    setLoading(true)
    try {
      const b = await createBooking({
        flightId: flight.flightId,
        seatNo: selectedSeat,
        passengerName: name,
        totalAmount: flight.price,
      })
      setBooking({ id: b.id, status: b.status })
      setStep('done')
    } catch (e: any) {
      setErrorMsg(e.message)
      setStep('error')
    } finally {
      setLoading(false)
    }
  }

  // Seat grid: rows 1-25, cols A-F
  const COLS = ['A', 'B', 'C', 'D', 'E', 'F']
  const seatMap = new Map(seats.map(s => [s.seatNo, s.status]))

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 py-4">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-semibold">Book Flight</h1>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-6 space-y-4">
        {/* Flight summary */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400">{flight.flightNo} · {flight.airline}</p>
                <div className="flex items-center gap-3 mt-1">
                  <div>
                    <p className="text-2xl font-bold">{new Date(flight.departureAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</p>
                    <p className="text-sm text-gray-500">{flight.origin}</p>
                  </div>
                  <Plane className="h-5 w-5 rotate-90 text-blue-500" />
                  <div>
                    <p className="text-2xl font-bold">{new Date(flight.arrivalAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</p>
                    <p className="text-sm text-gray-500">{flight.destination}</p>
                  </div>
                </div>
                <p className="mt-1 text-xs text-gray-400">{formatDateTime(flight.departureAt)}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-blue-700">{formatVND(flight.price)}</p>
                <Badge variant="secondary">{flight.availableSeats} seats left</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Step: Passenger info */}
        {step === 'form' && (
          <Card>
            <CardHeader><CardTitle>Passenger Information</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name" placeholder="Nguyen Van A"
                  value={name} onChange={e => setName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && loadSeats()}
                />
              </div>
              <Button className="w-full" onClick={loadSeats} disabled={!name.trim() || loading}>
                {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Loading seats…</> : 'Choose Seat →'}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step: Seat picker */}
        {step === 'seats' && (
          <Card>
            <CardHeader>
              <CardTitle>Select Your Seat</CardTitle>
              <div className="flex gap-3 text-xs mt-2">
                <span className="flex items-center gap-1"><span className="h-4 w-4 rounded bg-green-100 border border-green-300" /> Available</span>
                <span className="flex items-center gap-1"><span className="h-4 w-4 rounded bg-gray-200 border border-gray-300" /> Taken</span>
                <span className="flex items-center gap-1"><span className="h-4 w-4 rounded bg-blue-600" /> Selected</span>
              </div>
            </CardHeader>
            <CardContent>
              {/* Seat grid */}
              <div className="overflow-auto">
                <div className="flex gap-1 mb-2 ml-10">
                  {COLS.map((c, i) => (
                    <div key={c} className={`w-9 text-center text-xs font-medium text-gray-400 ${i === 3 ? 'ml-4' : ''}`}>{c}</div>
                  ))}
                </div>
                <div className="space-y-1 max-h-72 overflow-y-auto">
                  {Array.from({ length: 25 }, (_, i) => i + 1).map(row => (
                    <div key={row} className="flex items-center gap-1">
                      <span className="w-8 text-right text-xs text-gray-400 pr-2">{String(row).padStart(2, '0')}</span>
                      {COLS.map((col, ci) => {
                        const seatNo = `${String(row).padStart(2, '0')}${col}`
                        const status = seatMap.get(seatNo) ?? 'AVAILABLE'
                        const isSelected = selectedSeat === seatNo
                        const isAvailable = status === 'AVAILABLE'
                        return (
                          <button
                            key={seatNo}
                            disabled={!isAvailable}
                            onClick={() => setSelectedSeat(seatNo)}
                            className={`${ci === 3 ? 'ml-4' : ''} h-9 w-9 rounded text-xs font-medium transition-colors
                              ${isSelected ? 'bg-blue-600 text-white' :
                                isAvailable ? 'bg-green-100 border border-green-300 hover:bg-green-200 text-green-800' :
                                'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
                          >
                            {isSelected ? '✓' : seatNo}
                          </button>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
              <Button className="mt-4 w-full" disabled={!selectedSeat} onClick={() => setStep('confirm')}>
                Confirm Seat {selectedSeat} →
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step: Confirm */}
        {step === 'confirm' && (
          <Card>
            <CardHeader><CardTitle>Confirm Booking</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg bg-gray-50 p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Passenger</span><span className="font-medium">{name}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Flight</span><span className="font-medium">{flight.flightNo}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Route</span><span className="font-medium">{flight.origin} → {flight.destination}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Seat</span><span className="font-medium">{selectedSeat}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Departure</span><span className="font-medium">{formatDateTime(flight.departureAt)}</span></div>
                <div className="flex justify-between border-t pt-2"><span className="font-semibold">Total</span><span className="text-lg font-bold text-blue-700">{formatVND(flight.price)}</span></div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep('seats')}>← Back</Button>
                <Button className="flex-1" onClick={handleBook} disabled={loading}>
                  {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</> : 'Confirm & Book'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step: Done */}
        {step === 'done' && booking && (
          <Card>
            <CardContent className="pt-6 text-center space-y-4">
              <CheckCircle className="mx-auto h-16 w-16 text-green-500" />
              <h2 className="text-xl font-bold">Booking Submitted!</h2>
              <p className="text-gray-500 text-sm">Your booking is being processed via our saga workflow.</p>
              <div className="rounded-lg bg-gray-50 p-4 text-sm text-left space-y-2">
                <div className="flex justify-between"><span className="text-gray-500">Booking ID</span><span className="font-mono text-xs">{booking.id}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Status</span><Badge variant="warning">{booking.status}</Badge></div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => navigate('/track', { state: { bookingId: booking.id } })}>Track Status</Button>
                <Button className="flex-1" onClick={() => navigate('/')}>Search More</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step: Error */}
        {step === 'error' && (
          <Card>
            <CardContent className="pt-6 text-center space-y-4">
              <XCircle className="mx-auto h-16 w-16 text-red-500" />
              <h2 className="text-xl font-bold">Booking Failed</h2>
              <p className="text-sm text-gray-500">{errorMsg}</p>
              <Button onClick={() => navigate('/')}>Back to Search</Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
