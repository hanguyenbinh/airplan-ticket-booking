import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plane, Search, ArrowRight, Clock, Users } from 'lucide-react'
import { searchFlights, type Flight, type SearchParams } from '@/lib/api'
import { formatVND, formatDateTime, cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const AIRPORTS = ['SGN', 'HAN', 'DAD', 'PQC', 'DLI']

export default function SearchPage() {
  const navigate = useNavigate()
  const [params, setParams] = useState<SearchParams>({
    from: 'SGN', to: 'HAN',
    passengers: 1,
  })
  const [flights, setFlights] = useState<Flight[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)

  const set = (key: keyof SearchParams, value: string | number) =>
    setParams((p: SearchParams) => ({ ...p, [key]: value }))

  const doSearch = async (p = 1) => {
    if (params.from && params.to && params.from === params.to) {
      setError('Origin and destination must be different'); return
    }
    setError(''); setLoading(true); setSearched(true); setPage(p)
    try {
      const result = await searchFlights({ ...params, page: p, limit: 20 })
      setFlights(result.data ?? [])
      setTotal(result.total ?? 0)
      setTotalPages(result.totalPages ?? 0)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = () => doSearch(1)

  const durationMins = (dep: string, arr: string) =>
    Math.round((new Date(arr).getTime() - new Date(dep).getTime()) / 60000)

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Hero */}
      <div className="bg-gradient-to-r from-blue-700 to-indigo-700 px-4 py-14 text-white">
        <div className="mx-auto max-w-4xl">
          <div className="mb-2 flex items-center gap-2 text-blue-200">
            <Plane className="h-5 w-5" />
            <span className="text-sm font-medium">Airline Booking</span>
          </div>
          <h1 className="mb-1 text-4xl font-bold">Find Your Flight</h1>
          <p className="text-blue-200">Search thousands of routes across Vietnam</p>
        </div>
      </div>

      {/* Search Box */}
      <div className="mx-auto max-w-4xl px-4">
        <Card className="-mt-8 shadow-xl">
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="space-y-1">
                <Label>From</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={params.from ?? ''}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => set('from', e.target.value)}
                >
                  <option value="">Any</option>
                  {AIRPORTS.map(a => <option key={a}>{a}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label>To</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={params.to ?? ''}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => set('to', e.target.value)}
                >
                  <option value="">Any</option>
                  {AIRPORTS.map(a => <option key={a}>{a}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Date <span className="text-gray-400 font-normal">(optional)</span></Label>
                <Input type="date" value={params.date ?? ''} onChange={e => set('date', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Passengers</Label>
                <Input
                  type="number" min={1} max={9}
                  value={params.passengers}
                  onChange={e => set('passengers', Number(e.target.value))}
                />
              </div>
            </div>
            {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
            <Button className="mt-4 w-full gap-2" onClick={handleSearch} disabled={loading}>
              <Search className="h-4 w-4" />
              {loading ? 'Searching…' : 'Search Flights'}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Results */}
      <div className="mx-auto max-w-4xl px-4 py-8">
        {searched && !loading && (
          <p className="mb-4 text-sm text-gray-500">
            {total > 0 ? `Found ${total} flight${total > 1 ? 's' : ''}` : 'No flights found'}
          </p>
        )}

        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          </div>
        )}

        <div className="space-y-3" id="results">
          {flights.map(f => (
            <Card key={f.flightId} className="transition-shadow hover:shadow-md">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-6">
                    {/* Airline */}
                    <div className="w-28">
                      <p className="text-xs text-gray-400">{f.flightNo}</p>
                      <p className="font-semibold text-gray-800">{f.airline}</p>
                    </div>

                    {/* Times */}
                    <div className="flex items-center gap-3">
                      <div className="text-center">
                        <p className="text-xl font-bold">{new Date(f.departureAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</p>
                        <p className="text-xs font-medium text-gray-500">{f.origin}</p>
                      </div>
                      <div className="flex flex-col items-center">
                        <p className="text-xs text-gray-400 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {durationMins(f.departureAt, f.arrivalAt)}m
                        </p>
                        <div className="flex items-center gap-1">
                          <div className="h-px w-12 bg-gray-300" />
                          <Plane className="h-3 w-3 rotate-90 text-gray-400" />
                          <div className="h-px w-12 bg-gray-300" />
                        </div>
                        <p className="text-xs text-gray-400">Direct</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xl font-bold">{new Date(f.arrivalAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</p>
                        <p className="text-xs font-medium text-gray-500">{f.destination}</p>
                      </div>
                    </div>
                  </div>

                  {/* Price + CTA */}
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-2xl font-bold text-blue-700">{formatVND(f.price)}</p>
                      <div className="flex items-center gap-1 justify-end">
                        <Users className="h-3 w-3 text-gray-400" />
                        <span className={cn('text-xs', f.availableSeats < 10 ? 'text-red-500 font-medium' : 'text-gray-400')}>
                          {f.availableSeats} seats left
                        </span>
                      </div>
                    </div>
                    <Button
                      disabled={f.availableSeats === 0}
                      onClick={() => navigate('/book', { state: { flight: f } })}
                    >
                      {f.availableSeats === 0 ? 'Full' : 'Select'}
                      {f.availableSeats > 0 && <ArrowRight className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <div className="mt-3 flex gap-2">
                  <Badge variant="secondary">{formatDateTime(f.departureAt).split(',')[0]}</Badge>
                  {f.availableSeats < 10 && f.availableSeats > 0 && (
                    <Badge variant="warning">Almost full</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-4">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => doSearch(page - 1)}>← Prev</Button>
            <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => doSearch(page + 1)}>Next →</Button>
          </div>
        )}
      </div>
    </div>
  )
}
