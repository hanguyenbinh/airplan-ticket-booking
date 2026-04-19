import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import BookPage from '@/pages/user/BookPage'

const flight = {
  flightId: '00000000-0000-4000-8000-0000000000f1',
  flightNo: 'VN100',
  airline: 'Vietnam Airlines',
  origin: 'SGN',
  destination: 'HAN',
  departureAt: '2025-12-20T06:00:00+07:00',
  arrivalAt: '2025-12-20T08:10:00+07:00',
  price: 850000,
  currency: 'VND',
  availableSeats: 149,
  totalSeats: 150,
}

describe('BookPage', () => {
  it('shows passenger step and can load seats', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={[{ pathname: '/book', state: { flight } }]}>
        <Routes>
          <Route path="/book" element={<BookPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: /Book Flight/i })).toBeInTheDocument()
    await user.type(screen.getByLabelText(/Full Name/i), 'Nguyen Van Test')
    await user.click(screen.getByRole('button', { name: /Choose Seat/i }))
    expect(await screen.findByRole('heading', { name: /Select Your Seat/i })).toBeInTheDocument()
  })
})
