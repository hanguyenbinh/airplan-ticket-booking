import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Search, TrendingUp, Clock, CheckCircle, XCircle } from 'lucide-react'
import { getAllBookings, type Booking, type BookingStatus } from '@/lib/api'
import { formatVND, formatDateTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const STATUS_VARIANT: Record<BookingStatus, 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline'> = {
  INITIATED:          'secondary',
  SEAT_LOCKED:        'warning',
  PAYMENT_PROCESSING: 'warning',
  CONFIRMED:          'success',
  FAILED:             'destructive',
  CANCELLED:          'outline',
}

export default function AdminBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [filtered, setFiltered] = useState<Booking[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<BookingStatus | 'ALL'>('ALL')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getAllBookings()
      setBookings(data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    let result = bookings
    if (statusFilter !== 'ALL') result = result.filter(b => b.status === statusFilter)
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(b =>
        b.id.toLowerCase().includes(q) ||
        b.passengerName.toLowerCase().includes(q) ||
        b.seatNo.toLowerCase().includes(q)
      )
    }
    setFiltered(result)
  }, [bookings, search, statusFilter])

  // Stats
  const stats = {
    total:     bookings.length,
    confirmed: bookings.filter(b => b.status === 'CONFIRMED').length,
    pending:   bookings.filter(b => ['INITIATED', 'SEAT_LOCKED', 'PAYMENT_PROCESSING'].includes(b.status)).length,
    failed:    bookings.filter(b => ['FAILED', 'CANCELLED'].includes(b.status)).length,
    revenue:   bookings.filter(b => b.status === 'CONFIRMED').reduce((s, b) => s + Number(b.totalAmount), 0),
  }

  const STATUSES: (BookingStatus | 'ALL')[] = ['ALL', 'INITIATED', 'SEAT_LOCKED', 'CONFIRMED', 'FAILED', 'CANCELLED']

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Bookings</h2>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard icon={<TrendingUp className="h-5 w-5 text-blue-600" />} label="Total" value={stats.total} bg="bg-blue-50" />
        <StatCard icon={<CheckCircle className="h-5 w-5 text-green-600" />} label="Confirmed" value={stats.confirmed} bg="bg-green-50" />
        <StatCard icon={<Clock className="h-5 w-5 text-yellow-600" />} label="Pending" value={stats.pending} bg="bg-yellow-50" />
        <StatCard icon={<XCircle className="h-5 w-5 text-red-600" />} label="Failed/Cancelled" value={stats.failed} bg="bg-red-50" />
      </div>

      {/* Revenue */}
      <Card className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
        <CardContent className="pt-4">
          <p className="text-blue-100 text-sm">Total Revenue (Confirmed)</p>
          <p className="text-3xl font-bold mt-1">{formatVND(stats.revenue)}</p>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            className="pl-9"
            placeholder="Search by name, ID, seat…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {STATUSES.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3 text-left">Passenger</th>
                <th className="px-4 py-3 text-left">Seat</th>
                <th className="px-4 py-3 text-left">Amount</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Created</th>
                <th className="px-4 py-3 text-left">Booking ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="py-12 text-center text-gray-400">No bookings found</td></tr>
              )}
              {filtered.map(b => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{b.passengerName}</td>
                  <td className="px-4 py-3 font-mono">{b.seatNo}</td>
                  <td className="px-4 py-3 font-semibold text-blue-700">{formatVND(Number(b.totalAmount))}</td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[b.status]}>{b.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{formatDateTime(b.createdAt)}</td>
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">{b.id.slice(0, 8)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t px-4 py-2 text-xs text-gray-400">
          Showing {filtered.length} of {bookings.length} bookings
        </div>
      </Card>
    </div>
  )
}

function StatCard({ icon, label, value, bg }: { icon: React.ReactNode; label: string; value: number; bg: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className={`mb-3 inline-flex rounded-lg p-2 ${bg}`}>{icon}</div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-sm text-gray-500">{label}</p>
      </CardContent>
    </Card>
  )
}
