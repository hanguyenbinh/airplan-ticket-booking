-- ============================================================
-- Seed: booking_db  →  table: bookings
-- 1000 rows
--
-- Referencing flights 1–50 (n % 50 + 1)
-- Passenger names: 15 Vietnamese name variants × index
-- Status distribution:
--   60% CONFIRMED     (n % 20 <  12)
--   15% FAILED        (n % 20 in 12–14)
--   10% CANCELLED     (n % 20 in 15–16)
--   10% SEAT_LOCKED   (n % 20 in 17–18)
--    5% INITIATED     (n % 20 = 19)
--
-- Prices cycle through 5 tiers matching route cost
-- Dates spread over past 90 days
-- ============================================================

INSERT INTO "bookings" (
  "id",
  "flightId",
  "seatNo",
  "passengerName",
  "totalAmount",
  "status",
  "sagaState",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),

  -- flight 1..50
  ( lpad((n % 50 + 1)::text, 8, '0')
    || '-0000-4000-8000-'
    || lpad((n % 50 + 1)::text, 12, '0')
  )::uuid,

  -- seat: row 1–25, col A–F
  (n % 25 + 1)::text || chr(65 + n % 6),

  -- passenger name: first name + last name + unique number
  (ARRAY[
    'Nguyen Van An',    'Tran Thi Bich',   'Le Van Cuong',
    'Pham Thi Dung',    'Hoang Van Em',    'Vu Thi Phuong',
    'Dang Van Quang',   'Bui Thi Huong',   'Do Van Khai',
    'Nguyen Thi Lan',   'Truong Van Minh', 'Ly Thi Ngoc',
    'Dinh Van Phuc',    'Ngo Thi Quynh',   'Tran Van Son'
  ])[n % 15 + 1] || ' #' || n::text,

  -- amount: 5 tiers matching route base prices
  (ARRAY[850000, 650000, 550000, 480000, 430000])[n % 5 + 1]::decimal(12,2),

  -- status
  CASE
    WHEN n % 20 < 12 THEN 'CONFIRMED'
    WHEN n % 20 < 15 THEN 'FAILED'
    WHEN n % 20 < 17 THEN 'CANCELLED'
    WHEN n % 20 < 19 THEN 'SEAT_LOCKED'
    ELSE                   'INITIATED'
  END,

  -- sagaState (JSONB) — matches status
  CASE
    WHEN n % 20 < 12 THEN
      '{"step":"DONE"}'::jsonb
    WHEN n % 20 < 15 THEN
      jsonb_build_object('step', 'COMPENSATED', 'error',
        (ARRAY[
          'Payment declined',
          'Seat lock expired',
          'Insufficient funds',
          'Card blocked'
        ])[n % 4 + 1])
    WHEN n % 20 < 17 THEN
      '{"step":"CANCELLED"}'::jsonb
    WHEN n % 20 < 19 THEN
      jsonb_build_object('step', 'LOCKING_SEAT',
                         'lockToken', 'lock-' || lpad(n::text, 6, '0'))
    ELSE
      '{"step":"STARTED"}'::jsonb
  END,

  -- createdAt: spread over past 90 days
  NOW() - ((n % 90) || ' days')::interval
       - ((n % 24) || ' hours')::interval,

  -- updatedAt: slightly after createdAt
  NOW() - ((n % 90) || ' days')::interval
       - ((n % 24) || ' hours')::interval
       + ((n % 60) || ' minutes')::interval

FROM generate_series(0, 999) AS s(n);
