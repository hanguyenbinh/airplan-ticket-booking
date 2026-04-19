-- ============================================================
-- Seed: inventory_db  →  table: seats
-- 1000 rows across 7 flights (150 seats per flight)
--
-- Flight UUID pattern: XXXXXXXX-0000-4000-8000-XXXXXXXXXXXX
--   Flight 1 → 00000001-0000-4000-8000-000000000001
--   Flight 7 → 00000007-0000-4000-8000-000000000007
--
-- Seat layout:
--   n % 150 / 6 + 1  → row  (1–25)
--   chr(65 + n % 6)  → col  (A–F)
--   so seats are: 1A, 1B, 1C, 1D, 1E, 1F, 2A … 25F
--
-- Status distribution:
--   5%  LOCKED   (n % 20 = 1)
--   10% BOOKED   (n % 20 = 0 or 2)
--   85% AVAILABLE
-- ============================================================

INSERT INTO "seats" (
  "id",
  "flightId",
  "seatNo",
  "status",
  "lockToken",
  "lockedByBookingId",
  "lockExpiresAt",
  "version",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),

  -- flight 1..7  (integer division of n by 150, 1-based)
  ( lpad((n / 150 + 1)::text, 8, '0')
    || '-0000-4000-8000-'
    || lpad((n / 150 + 1)::text, 12, '0')
  )::uuid,

  -- seat label within the flight: row(1-25) + col(A-F)
  ((n % 150) / 6 + 1)::text || chr(65 + n % 6),

  -- status
  CASE
    WHEN n % 20 = 0 THEN 'BOOKED'
    WHEN n % 20 = 1 THEN 'LOCKED'
    WHEN n % 20 = 2 THEN 'BOOKED'
    ELSE 'AVAILABLE'
  END,

  -- lockToken  (only for LOCKED seats)
  CASE WHEN n % 20 = 1
    THEN 'lock-' || lpad(n::text, 6, '0')
    ELSE NULL
  END,

  -- lockedByBookingId (only for LOCKED seats)
  CASE WHEN n % 20 = 1
    THEN ( lpad((n % 50 + 1)::text, 8, '0')
           || '-aaaa-4000-8000-'
           || lpad(n::text, 12, '0') )::uuid::text
    ELSE NULL
  END,

  -- lockExpiresAt  (5 minutes from now for active locks)
  CASE WHEN n % 20 = 1
    THEN NOW() + INTERVAL '5 minutes'
    ELSE NULL
  END,

  1,  -- version (optimistic lock baseline)

  NOW() - ((n % 90) || ' days')::interval,
  NOW() - ((n % 90) || ' days')::interval

FROM generate_series(0, 999) AS s(n);
