# Seed Data — 1000 records per service

## Files

| File | Target DB | Table | Records |
|------|-----------|-------|---------|
| `01-inventory-seats.sql` | `inventory_db` | `seats` | 1,000 |
| `02-pricing-flights.sql` | `pricing_db` | `flight_prices` | 1,000 |
| `03-bookings.sql` | `booking_db` | `bookings` | 1,000 |
| `04-elasticsearch-seed.js` | Elasticsearch | `flights` index | 1,000 |

## How to run

### Option A — with Docker Compose running

```bash
# --- inventory_db ---
docker exec -i airline-booking-postgres-1 \
  psql -U postgres -d inventory_db \
  < infra/seeds/01-inventory-seats.sql

# --- pricing_db ---
docker exec -i airline-booking-postgres-1 \
  psql -U postgres -d pricing_db \
  < infra/seeds/02-pricing-flights.sql

# --- booking_db ---
docker exec -i airline-booking-postgres-1 \
  psql -U postgres -d booking_db \
  < infra/seeds/03-bookings.sql

# --- Elasticsearch ---
node infra/seeds/04-elasticsearch-seed.js
```

### Option B — connect directly (psql installed locally)

```bash
psql postgresql://postgres:postgres@localhost:5432/inventory_db \
  -f infra/seeds/01-inventory-seats.sql

psql postgresql://postgres:postgres@localhost:5432/pricing_db \
  -f infra/seeds/02-pricing-flights.sql

psql postgresql://postgres:postgres@localhost:5432/booking_db \
  -f infra/seeds/03-bookings.sql

node infra/seeds/04-elasticsearch-seed.js
```

### Option C — pgAdmin / DBeaver / TablePlus

Open each database, paste the SQL file content, and run it.

## Data overview

### seats (inventory_db)
- 7 flights, each with 150 seats (rows 1-25, cols A-F)
- Status: **85%** AVAILABLE · **10%** BOOKED · **5%** LOCKED
- Flight IDs: `00000001-0000-4000-8000-000000000001` … `00000007-…`

### flight_prices (pricing_db)
- 1,000 unique flights
- 10 route types (SGN-HAN, SGN-DAD, HAN-DAD, SGN-PQC, SGN-DLI and reverse)
- `currentPrice` auto-calculated from occupancy:
  - < 30% booked → base × 1.0
  - 30–60%        → base × 1.2
  - 60–80%        → base × 1.5
  - > 80%         → base × 2.0

### bookings (booking_db)
- 1,000 bookings across 50 flights
- Status: **60%** CONFIRMED · **15%** FAILED · **10%** CANCELLED · **10%** SEAT_LOCKED · **5%** INITIATED
- `sagaState` JSONB is consistent with status
- Dates: spread over the past 90 days

### Elasticsearch (flights index)
- 1,000 flight documents
- Covers all 10 routes × 4 airlines × multiple departure times
- `price` updated by occupancy (same formula as pricing_db)
- `availableSeats` reflects remaining capacity
