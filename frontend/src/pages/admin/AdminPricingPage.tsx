import { useState } from 'react'
import { Search, TrendingUp, TrendingDown } from 'lucide-react'
import { getFlightPrice, type FlightPrice } from '@/lib/api'
import { formatVND, formatDateTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const SAMPLE_FLIGHTS = [
  '00000001-0000-4000-8000-000000000001',
  '00000002-0000-4000-8000-000000000002',
  '00000003-0000-4000-8000-000000000003',
  '00000004-0000-4000-8000-000000000004',
  '00000005-0000-4000-8000-000000000005',
]

export default function AdminPricingPage() {
  const [flightId, setFlightId] = useState('')
  const [prices, setPrices] = useState<FlightPrice[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const addFlight = async (id = flightId) => {
    if (!id.trim()) return
    setLoading(true); setError('')
    try {
      const data = await getFlightPrice(id)
      setPrices(prev => {
        const exists = prev.find(p => p.flightId === data.flightId)
        return exists ? prev.map(p => p.flightId === data.flightId ? data : p) : [data, ...prev]
      })
      setFlightId('')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const occupancy = (p: FlightPrice) => p.totalSeats > 0 ? p.bookedSeats / p.totalSeats : 0
  const surcharge = (p: FlightPrice) => ((p.currentPrice - p.basePrice) / p.basePrice) * 100

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Dynamic Pricing</h2>

      {/* Search */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="space-y-1">
            <Label>Add Flight ID to monitor</Label>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. 00000001-0000-4000-8000-000000000001"
                value={flightId}
                onChange={e => setFlightId(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addFlight()}
              />
              <Button onClick={() => addFlight()} disabled={!flightId || loading}>
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-gray-400 self-center">Load samples:</span>
            {SAMPLE_FLIGHTS.map(id => (
              <button
                key={id}
                onClick={() => addFlight(id)}
                className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600 hover:bg-gray-200 font-mono"
              >
                {id.slice(0, 8)}…
              </button>
            ))}
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </CardContent>
      </Card>

      {prices.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {prices.map(p => {
            const occ = occupancy(p)
            const surge = surcharge(p)
            const hasMarkup = surge > 0

            return (
              <Card key={p.flightId}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base font-mono">{p.flightId.slice(0, 8)}…</CardTitle>
                      <p className="text-xs text-gray-400 mt-0.5">Updated {formatDateTime(p.updatedAt)}</p>
                    </div>
                    {hasMarkup
                      ? <Badge variant="warning" className="flex items-center gap-1"><TrendingUp className="h-3 w-3" />+{surge.toFixed(0)}%</Badge>
                      : <Badge variant="success" className="flex items-center gap-1"><TrendingDown className="h-3 w-3" />Base</Badge>}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Occupancy bar */}
                  <div>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>Occupancy</span>
                      <span>{p.bookedSeats}/{p.totalSeats} seats ({(occ * 100).toFixed(0)}%)</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100">
                      <div
                        className={`h-2 rounded-full transition-all ${occ > 0.8 ? 'bg-red-500' : occ > 0.6 ? 'bg-orange-500' : occ > 0.3 ? 'bg-yellow-500' : 'bg-green-500'}`}
                        style={{ width: `${occ * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Prices */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-gray-50 p-3 text-center">
                      <p className="text-xs text-gray-400">Base Price</p>
                      <p className="font-semibold text-gray-700 mt-0.5">{formatVND(p.basePrice)}</p>
                    </div>
                    <div className={`rounded-lg p-3 text-center ${hasMarkup ? 'bg-orange-50' : 'bg-green-50'}`}>
                      <p className="text-xs text-gray-400">Current Price</p>
                      <p className={`font-bold mt-0.5 ${hasMarkup ? 'text-orange-600' : 'text-green-600'}`}>{formatVND(p.currentPrice)}</p>
                    </div>
                  </div>

                  {/* Pricing tiers legend */}
                  <div className="text-xs text-gray-400 space-y-0.5">
                    <p className="font-medium text-gray-500 mb-1">Pricing tiers:</p>
                    {[
                      { label: '< 30% booked', mult: '×1.0 (base)', active: occ < 0.3 },
                      { label: '30–60% booked', mult: '×1.2', active: occ >= 0.3 && occ < 0.6 },
                      { label: '60–80% booked', mult: '×1.5', active: occ >= 0.6 && occ < 0.8 },
                      { label: '> 80% booked',  mult: '×2.0', active: occ >= 0.8 },
                    ].map(t => (
                      <div key={t.label} className={`flex justify-between px-2 py-0.5 rounded ${t.active ? 'bg-blue-50 text-blue-700 font-medium' : ''}`}>
                        <span>{t.label}</span><span>{t.mult}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {prices.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <TrendingUp className="h-12 w-12 mb-3 opacity-20" />
          <p>Enter a Flight ID above to view its pricing data</p>
        </div>
      )}
    </div>
  )
}
