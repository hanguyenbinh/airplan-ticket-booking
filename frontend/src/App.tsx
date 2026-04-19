import { BrowserRouter, Routes, Route } from 'react-router-dom'
import UserLayout from '@/components/UserLayout'
import AdminLayout from '@/components/AdminLayout'
import SearchPage from '@/pages/user/SearchPage'
import BookPage from '@/pages/user/BookPage'
import TrackPage from '@/pages/user/TrackPage'
import AdminBookingsPage from '@/pages/admin/AdminBookingsPage'
import AdminInventoryPage from '@/pages/admin/AdminInventoryPage'
import AdminPricingPage from '@/pages/admin/AdminPricingPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* User app */}
        <Route element={<UserLayout />}>
          <Route path="/"      element={<SearchPage />} />
          <Route path="/book"  element={<BookPage />} />
          <Route path="/track" element={<TrackPage />} />
        </Route>

        {/* Admin app */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route index                 element={<AdminBookingsPage />} />
          <Route path="inventory"      element={<AdminInventoryPage />} />
          <Route path="pricing"        element={<AdminPricingPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
