import { Outlet, NavLink, Link } from 'react-router-dom'
import { LayoutDashboard, Armchair, TrendingUp, ArrowLeft, Plane } from 'lucide-react'

const NAV = [
  { to: '/admin',           icon: <LayoutDashboard className="h-4 w-4" />, label: 'Bookings' },
  { to: '/admin/inventory', icon: <Armchair className="h-4 w-4" />,        label: 'Inventory' },
  { to: '/admin/pricing',   icon: <TrendingUp className="h-4 w-4" />,      label: 'Pricing' },
]

export default function AdminLayout() {
  return (
    <div className="min-h-screen flex bg-gray-100">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 bg-gray-900 text-white flex flex-col">
        <div className="px-4 py-6 border-b border-gray-700">
          <div className="flex items-center gap-2 mb-1">
            <Plane className="h-5 w-5 text-blue-400" />
            <span className="font-bold text-lg">AirAdmin</span>
          </div>
          <p className="text-xs text-gray-400">Operations Dashboard</p>
        </div>

        <nav className="flex-1 px-2 py-4 space-y-1">
          {NAV.map(n => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/admin'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              {n.icon}
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="px-2 pb-4">
          <Link
            to="/"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to User App
          </Link>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <div className="p-6 max-w-6xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
