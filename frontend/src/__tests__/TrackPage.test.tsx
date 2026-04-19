import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import TrackPage from '@/pages/user/TrackPage'

describe('TrackPage', () => {
  it('loads booking when id is looked up', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/track']}>
        <Routes>
          <Route path="/track" element={<TrackPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: /Track Booking/i })).toBeInTheDocument()
    const input = screen.getByPlaceholderText(/550e8400/i)
    await user.type(input, '00000000-0000-4000-8000-000000000001')
    await user.keyboard('{Enter}')
    await screen.findByText('Booking Status')
    expect(screen.getByText('Booking received, processing...')).toBeInTheDocument()
  })
})
