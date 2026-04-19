import { useState } from 'react'
import { Search } from 'lucide-react'
import { getFlightSeats, type Seat, type SeatStatus } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const COLS = ['A', 'B', 'C', 'D', 'E', 'F']

const STATUS_COLOR: Record<SeatStatus, string> = {
  AVAILABLE: 'bg-green-100 border-green-300 text-green-800',
  LOCKED:    'bg-yellow-100 border-yellow-300 text-yellow-800',
  BOOKED:    'bg-red-100   border-red-300   text-red-800',
}

const SAMPLE_FLIGHTS = [
  '00000001-0000-4000-8000-000000000001',
  '00000002-0000-4000-8000-000000000002',
  '00000003-0000-4000-8000-000000000003',
]

export default function AdminInventoryPage() {
  const [flightId, setFlightId] = useState('')
  const [seats, setSeats] = useState<Seat[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)

  const load = async (id = flightId) => {
    if (!id.trim()) return
    setLoading(true); setError(''); setSearched(true)
    try {
      const data = await getFlightSeats(id)
      setSeats(data)
    } catch (e: any) {
      setError(e.message)
      setSeats([])
    } finally {
      setLoading(false)
    }
  }

  const seatMap = new Map(seats.map(s => [s.seatNo, s]))
  const available = seats.filter(s => s.status === 'AVAILABLE').length
  const locked    = seats.filter(s => s.status === 'LOCKED').length
  const booked    = seats.filter(s => s.status === 'BOOKED').length

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Seat Inventory</h2>

      {/* Search */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="space-y-1">
            <Label>Flight ID</Label>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. 00000001-0000-4000-8000-000000000001"
                value={flightId}
                onChange={e => setFlightId(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && load()}
              />
              <Button onClick={() => load()} disabled={!flightId || loading}>
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-gray-400 self-center">Quick load:</span>
            {SAMPLE_FLIGHTS.map(id => (
              <button
                key={id}
                onClick={() => { setFlightId(id); load(id) }}
                className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600 hover:bg-gray-200 font-mono"
              >
                {id.slice(0, 8)}…
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      )}

      {!loading && searched && seats.length > 0 && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <Card><CardContent className="pt-4 text-center">
              <p className="text-2xl font-bold text-green-600">{available}</p>
              <p className="text-sm text-gray-500">Available</p>
            </CardContent></Card>
            <Card><CardContent className="pt-4 text-center">
              <p className="text-2xl font-bold text-yellow-600">{locked}</p>
              <p className="text-sm text-gray-500">Locked</p>
            </CardContent></Card>
            <Card><CardContent className="pt-4 text-center">
              <p className="text-2xl font-bold text-red-600">{booked}</p>
              <p className="text-sm text-gray-500">Booked</p>
            </CardContent></Card>
          </div>

          {/* Legend */}
          <div className="flex gap-4 text-xs">
            {(['AVAILABLE', 'LOCKED', 'BOOKED'] as SeatStatus[]).map(s => (
              <span key={s} className="flex items-center gap-1.5">
                <span className={`h-4 w-4 rounded border ${STATUS_COLOR[s]}`} />
                {s}
              </span>
            ))}
          </div>

          {/* Seat Map */}
          <Card>
            <CardHeader><CardTitle>Seat Map</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-auto">
                {/* Column headers */}
                <div className="flex gap-1 mb-2 ml-10">
                  {COLS.map((c, i) => (
                    <div key={c} className={`w-10 text-center text-xs font-medium text-gray-400 ${i === 3 ? 'ml-4' : ''}`}>{c}</div>
                  ))}
                </div>

                <div className="space-y-1">
                  {Array.from({ length: 25 }, (_, i) => i + 1).map(row => (
                    <div key={row} className="flex items-center gap-1">
                      <span className="w-8 text-right text-xs text-gray-400 pr-2 shrink-0">{row}</span>
                      {COLS.map((col, ci) => {
                        const seatNo = `${row}${col}`
                        const seat = seatMap.get(seatNo)
                        const status: SeatStatus = seat?.status ?? 'AVAILABLE'
                        return (
                          <div
                            key={seatNo}
                            title={seat ? `${seatNo}: ${status}${seat.lockExpiresAt ? ` (expires ${new Date(seat.lockExpiresAt).toLocaleTimeString()})` : ''}` : seatNo}
                            className={`${ci === 3 ? 'ml-4' : ''} h-10 w-10 rounded border text-xs flex items-center justify-center font-medium cursor-default ${STATUS_COLOR[status]}`}
                          >
                            {seatNo}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Locked seats detail */}
          {locked > 0 && (
            <Card>
              <CardHeader><CardTitle>Locked Seats ({locked})</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  {seats.filter(s => s.status === 'LOCKED').map(s => (
                    <div key={s.id} className="flex items-center justify-between rounded-lg bg-yellow-50 px-3 py-2">
                      <span className="font-medium">{s.seatNo}</span>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span>Booking: <span className="font-mono">{s.lockedByBookingId?.slice(0, 8)}…</span></span>
                        {s.lockExpiresAt && <Badge variant="warning">Expires {new Date(s.lockExpiresAt).toLocaleTimeString()}</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {!loading && searched && seats.length === 0 && !error && (
        <p className="text-center text-gray-400 py-12">No seats found for this flight</p>
      )}
    </div>
  )
}
