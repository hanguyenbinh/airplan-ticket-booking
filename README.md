# ✈ Airline Booking — Microservices với NestJS + Kubernetes

Hệ thống đặt vé máy bay production-grade với 5 microservices.

## Architecture

```
Client → Nginx Ingress → booking-service   (HTTP :3001)
                       → search-service    (HTTP :3003)
                       → inventory-service (HTTP :3002)

Event Bus (Redpanda / Kafka-compatible):
  booking-service   → [seat.lock]          → inventory-service
  inventory-service → [inventory.changed]  → pricing-service
  pricing-service   → [pricing.updated]    → search-service
  booking-service   → [booking.confirmed]  → notification-service
```

## Services

| Service | Port | Database | Mô tả |
|---------|------|----------|-------|
| booking-service | 3001 | PostgreSQL | Saga orchestrator |
| inventory-service | 3002 | PostgreSQL + Redis | Seat locking |
| search-service | 3003 | Elasticsearch | Flight search |
| pricing-service | 3004 | PostgreSQL | Dynamic pricing |
| notification-service | 3005 | — | Email/SMS |

## Infrastructure

| Component | Image | Ghi chú |
|-----------|-------|---------|
| PostgreSQL | bitnami/postgresql (Helm) | Databases: `booking_db`, `inventory_db`, `pricing_db` |
| Redis | bitnami/redis (Helm) | Auth disabled cho local dev |
| Redpanda | redpandadata/redpanda:v24.3.1 | Kafka-compatible, KRaft mode, no ZooKeeper |
| Elasticsearch | docker.elastic.co/elasticsearch/elasticsearch:8.17.4 | Security disabled cho local dev |

## Cách chạy

### Option 1: Docker Compose (đơn giản nhất)

```bash
docker-compose up -d
```

### Option 2: Kubernetes Local

#### Prerequisites

- Docker Desktop với K8s enabled, hoặc minikube
- kubectl
- Helm 3 (`winget install Helm.Helm` trên Windows)

#### Deploy với script (recommended)

```bash
# Docker Desktop K8s:
./k8s/deploy.sh docker-desktop

# minikube:
minikube start --driver=docker --cpus=4 --memory=8192
minikube addons enable ingress
minikube addons enable metrics-server
./k8s/deploy.sh minikube
```

Script tự động:
1. Build tất cả Docker images
2. Cài Nginx Ingress Controller
3. Cài PostgreSQL + Redis qua Helm
4. Deploy Redpanda (Kafka) + Elasticsearch qua manifest
5. Tạo application databases (`booking_db`, `inventory_db`, `pricing_db`)
6. Apply toàn bộ K8s manifests
7. Chờ services ready

#### Thêm vào hosts file

Windows: `C:\Windows\System32\drivers\etc\hosts`
Mac/Linux: `/etc/hosts`

```
127.0.0.1 airline.local
```

#### Test API

```bash
# Tìm chuyến bay
curl "http://airline.local/api/search/flights?from=SGN&to=HAN&date=2024-12-20"

# Đặt vé
curl -X POST http://airline.local/api/bookings \
  -H "Content-Type: application/json" \
  -d '{"flightId":"uuid","seatNo":"12A","passengerName":"Nguyen Van A","totalAmount":850000}'
```

## Frontend

React + Tailwind CSS + shadcn/ui app with two interfaces.

### Run

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

The dev server proxies all `/api/*` requests to `http://airline.local` automatically — no CORS configuration needed.

### User App

| Page | Route | Features |
|------|-------|---------|
| Search | `/` | Search flights by origin, destination, date, passengers; live results with price and seat availability |
| Book | `/book` | Passenger info → visual seat map (green/yellow/red) → booking confirmation |
| Track | `/track` | Look up booking by ID; progress stepper auto-refreshes every 5s while saga is in-progress |

### Admin App (`/admin`)

| Page | Route | Features |
|------|-------|---------|
| Bookings | `/admin` | Stats cards, total revenue counter, filterable + searchable bookings table |
| Inventory | `/admin/inventory` | Full seat map grid per flight; locked seats with expiry times |
| Pricing | `/admin/pricing` | Occupancy bar + dynamic pricing tier visualizer per flight |

### Seed data for the frontend

```bash
# PostgreSQL seeds (run once after deploy)
kubectl exec -i postgres-postgresql-0 -n airline -- \
  env PGPASSWORD=postgres psql -U postgres -d inventory_db \
  < infra/seeds/01-inventory-seats.sql

kubectl exec -i postgres-postgresql-0 -n airline -- \
  env PGPASSWORD=postgres psql -U postgres -d pricing_db \
  < infra/seeds/02-pricing-flights.sql

kubectl exec -i postgres-postgresql-0 -n airline -- \
  env PGPASSWORD=postgres psql -U postgres -d booking_db \
  < infra/seeds/03-bookings.sql

# Elasticsearch seed (requires port-forward in another terminal)
kubectl port-forward svc/elasticsearch-master 9200:9200 -n airline
node infra/seeds/04-elasticsearch-seed.js
```

## Testing

| Layer | Where | Command | Notes |
|-------|--------|---------|-------|
| **Unit** | Each `*-service` under `src/**/__tests__/*.spec.ts` | `npm test` in that service | Jest + mocks |
| **Integration** | `*.integration.spec.ts` in each service | `npm run test:integration` | **Docker required** (Testcontainers) |
| **Contract** | [`tests/contract`](tests/contract) Zod schemas for Kafka payloads (`jest.config.cjs`) | `cd tests/contract && npm install && npm test` | No infra |
| **E2E** | [`tests/e2e`](tests/e2e) Playwright | `cd tests/e2e && npm install && npx playwright install && npm run test:e2e` | Set `E2E_BASE_URL` (default `http://localhost:5173`). Backend must be reachable (e.g. Vite + ingress). |
| **Frontend unit** | [`frontend/src/__tests__`](frontend/src/__tests__) | `cd frontend && npm install && npm test` | Vitest + MSW + Testing Library |

Examples:

```bash
cd booking-service && npm install && npm test
cd booking-service && npm run test:integration   # starts Postgres in Docker

cd frontend && npm install && npm test

cd tests/contract && npm install && npm test

# E2E (start Vite + cluster first)
cd tests/e2e && npm install && npx playwright install
npm run test:e2e
```

## Useful Commands

```bash
# Xem tất cả pods
kubectl get pods -n airline

# Xem logs real-time
kubectl logs -l app=booking-service -n airline -f

# Port forward để debug
kubectl port-forward svc/booking-service   3001:3001 -n airline
kubectl port-forward svc/inventory-service 3002:3002 -n airline
kubectl port-forward svc/search-service    3003:3003 -n airline

# Exec vào pod
kubectl exec -it $(kubectl get pod -l app=booking-service -n airline -o jsonpath='{.items[0].metadata.name}') -n airline -- sh

# Scale manual
kubectl scale deployment booking-service --replicas=5 -n airline

# Rollback
kubectl rollout undo deployment/booking-service -n airline

# Restart một service (sau khi rebuild image)
docker build -t airline/booking-service:latest ./booking-service
kubectl rollout restart deployment/booking-service -n airline

# Xem events (debug lỗi)
kubectl get events -n airline --sort-by='.lastTimestamp'

# Dừng toàn bộ (xóa namespace)
kubectl delete namespace airline
helm uninstall postgres redis -n airline 2>/dev/null || true

# Dừng nhưng giữ data (PVCs)
kubectl delete deployments,statefulsets,jobs --all -n airline
```

## K8s Manifest Files

| File | Mô tả |
|------|-------|
| `k8s/00-namespace.yml` | Namespace `airline` |
| `k8s/00b-init-db.yml` | Job tạo databases trong PostgreSQL |
| `k8s/01-configmap.yml` | Shared config (Kafka broker, Redis URL, ES URL) |
| `k8s/02-secrets.yml` | Database URLs, JWT secret |
| `k8s/03-booking-service.yml` | Deployment + Service + HPA |
| `k8s/04-inventory-service.yml` | Deployment + Service + HPA |
| `k8s/05-search-service.yml` | Deployment + Service |
| `k8s/06-pricing-notification.yml` | pricing-service + notification-service |
| `k8s/07-ingress.yml` | Nginx Ingress rules |
| `k8s/kafka.yml` | Redpanda StatefulSet + Service |
| `k8s/elasticsearch.yml` | Elasticsearch StatefulSet + Service |
