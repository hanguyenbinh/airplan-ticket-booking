-- ============================================================
-- Seed: pricing_db  →  table: flight_prices
-- 1000 rows  (one pricing record per unique flightId)
--
-- Routes cycle through 10 route types (n % 10):
--   0,1  → SGN-HAN / HAN-SGN  base: 850,000 VND
--   2,3  → SGN-DAD / DAD-SGN  base: 550,000 VND
--   4,5  → HAN-DAD / DAD-HAN  base: 520,000 VND
--   6,7  → SGN-PQC / PQC-SGN  base: 480,000 VND
--   8,9  → SGN-DLI / DLI-SGN  base: 430,000 VND
--
-- bookedSeats = n % 120  (varies 0–119 out of 150)
-- currentPrice is auto-calculated from occupancy:
--   < 30%  → basePrice × 1.0
--   30-60% → basePrice × 1.2
--   60-80% → basePrice × 1.5
--   > 80%  → basePrice × 2.0  (rounded to nearest 1,000)
-- ============================================================

WITH base AS (
  SELECT
    n,
    -- flight UUID
    ( lpad(n::text, 8, '0')
      || '-0000-4000-8000-'
      || lpad(n::text, 12, '0')
    )::uuid                                     AS flight_id,

    -- base price by route type
    CASE n % 10
      WHEN 0 THEN 850000
      WHEN 1 THEN 850000
      WHEN 2 THEN 550000
      WHEN 3 THEN 550000
      WHEN 4 THEN 520000
      WHEN 5 THEN 520000
      WHEN 6 THEN 480000
      WHEN 7 THEN 480000
      WHEN 8 THEN 430000
      ELSE        430000
    END                                         AS base_price,

    n % 120                                     AS booked_seats,
    150                                         AS total_seats

  FROM generate_series(1, 1000) AS s(n)
),
priced AS (
  SELECT
    *,
    CASE
      WHEN booked_seats::float / total_seats < 0.30
        THEN ROUND(base_price * 1.0 / 1000) * 1000
      WHEN booked_seats::float / total_seats < 0.60
        THEN ROUND(base_price * 1.2 / 1000) * 1000
      WHEN booked_seats::float / total_seats < 0.80
        THEN ROUND(base_price * 1.5 / 1000) * 1000
      ELSE
        ROUND(base_price * 2.0 / 1000) * 1000
    END                                         AS current_price
  FROM base
)
INSERT INTO "flight_prices" (
  "flightId",
  "basePrice",
  "currentPrice",
  "bookedSeats",
  "totalSeats",
  "updatedAt"
)
SELECT
  flight_id,
  base_price   ::decimal(12,2),
  current_price::decimal(12,2),
  booked_seats,
  total_seats,
  NOW() - ((n % 60) || ' days')::interval
FROM priced;
