import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from './mocks/server'
import SearchPage from '@/pages/user/SearchPage'

describe('SearchPage', () => {
  it('renders search form', () => {
    render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<SearchPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: /Find Your Flight/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Search Flights/i })).toBeInTheDocument()
  })

  it('submits search and shows flight cards from API', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<SearchPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: /Search Flights/i }))
    expect(await screen.findByText(/VN100/i)).toBeInTheDocument()
  })

  it('disables Next on last page', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('http://localhost:5173/api/search/flights', ({ request }) => {
        const url = new URL(request.url)
        const page = Number(url.searchParams.get('page') ?? '1')
        const limit = Number(url.searchParams.get('limit') ?? '20')
        return HttpResponse.json({
          data: [
            {
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
            },
          ],
          total: 45,
          page,
          limit,
          totalPages: 3,
        })
      }),
    )

    render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<SearchPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: /Search Flights/i }))
    await screen.findByText(/Page 1 of 3/i)

    await user.click(screen.getByRole('button', { name: /Next/i }))
    await screen.findByText(/Page 2 of 3/i)

    await user.click(screen.getByRole('button', { name: /Next/i }))
    await screen.findByText(/Page 3 of 3/i)

    expect(screen.getByRole('button', { name: /Next/i })).toBeDisabled()
  })
})
