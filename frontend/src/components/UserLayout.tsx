import { Outlet, NavLink } from 'react-router-dom'
import { Search, BookOpen, Settings } from 'lucide-react'

export default function UserLayout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Outlet />

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-white px-6 pb-safe">
        <div className="mx-auto flex max-w-md justify-around">
          <NavItem to="/"       icon={<Search className="h-5 w-5" />}   label="Search" />
          <NavItem to="/track"  icon={<BookOpen className="h-5 w-5" />} label="My Booking" />
          <NavItem to="/admin"  icon={<Settings className="h-5 w-5" />} label="Admin" />
        </div>
      </nav>
      <div className="h-16" /> {/* bottom nav spacer */}
    </div>
  )
}

function NavItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `flex flex-col items-center gap-0.5 py-2 px-4 text-xs font-medium transition-colors ${
          isActive ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
        }`
      }
    >
      {icon}
      {label}
    </NavLink>
  )
}
