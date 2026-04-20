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
| booking-service | 3001 | PostgreSQL `booking_db` | Saga orchestrator |
| inventory-service | 3002 | PostgreSQL `inventory_db` + Redis | Seat locking |
| search-service | 3003 | Elasticsearch | Flight search |
| pricing-service | 3004 | PostgreSQL `pricing_db` | Dynamic pricing |
| notification-service | 3005 | — | Email/SMS |

## Infrastructure

| Component | Image | Ghi chú |
|-----------|-------|---------|
| PostgreSQL | bitnami/postgresql (Helm) | Databases: `booking_db`, `inventory_db`, `pricing_db`; `deploy.sh` sets `max_connections=400` + memory limits for stress |
| Redis | bitnami/redis (Helm) | Auth disabled cho local dev |
| Redpanda | redpandadata/redpanda:v24.3.1 | Kafka-compatible, KRaft; `--memory 1G` in `k8s/kafka.yml` for partition headroom |
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

#### Rebuild & redeploy (Kubernetes)

Images use tag `:latest` với `imagePullPolicy: Never` trên Docker Desktop — sau khi **build lại image trên cùng máy**, phải **restart deployment** thì pod mới chạy code mới.

**Cách nhanh (chỉ microservices, không chạy lại Helm toàn bộ):**

```bash
# 1) Build lại image (chỉ service bạn đổi, hoặc cả năm)
docker build -t airline/booking-service:latest      ./booking-service
docker build -t airline/inventory-service:latest    ./inventory-service
docker build -t airline/search-service:latest       ./search-service
docker build -t airline/pricing-service:latest      ./pricing-service
docker build -t airline/notification-service:latest ./notification-service

# 2) Rolling restart để pod dùng image mới + env ConfigMap mới
kubectl rollout restart deployment/booking-service deployment/inventory-service \
  deployment/search-service deployment/pricing-service deployment/notification-service -n airline

# 3) Đợi rollout (tùy chọn)
kubectl rollout status deployment/booking-service -n airline
```

**Chỉ đổi ConfigMap / manifest YAML** (không đổi code trong image):

```bash
kubectl apply -f k8s/01-configmap.yml   # ví dụ: shared-config
kubectl apply -f k8s/07-ingress.yml     # ví dụ: ingress
kubectl rollout restart deployment/booking-service deployment/inventory-service \
  deployment/search-service deployment/pricing-service deployment/notification-service -n airline
```

**Deploy lại từ đầu** (build + Helm + Kafka/ES + apply manifests): chạy `./k8s/deploy.sh docker-desktop` (hoặc `bash ./k8s/deploy.sh docker-desktop` trên Windows Git Bash), tương đương mục **Deploy với script** ở trên.

**Docker Compose** (không dùng K8s):

```bash
docker compose build
docker compose up -d
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
| **Stress** | [`tests/stress/run-stress.mjs`](tests/stress/run-stress.mjs) | `node tests/stress/run-stress.mjs` | Load on search/inventory/pricing; failures → stderr + `tests/stress/stress-errors.log` |

Examples:

```bash
cd booking-service && npm install && npm test
cd booking-service && npm run test:integration   # starts Postgres in Docker

cd frontend && npm install && npm test

cd tests/contract && npm install && npm test

# E2E (start Vite + cluster first)
cd tests/e2e && npm install && npx playwright install
npm run test:e2e

# Stress (ingress must be up; optional: STRESS_REQUESTS STRESS_CONCURRENCY STRESS_BASE_URL)
# If you see 504 from nginx: lower STRESS_CONCURRENCY, scale replicas, or ingress already uses 300s read timeout (k8s/07-ingress.yml).
# If Postgres flaps or booking returns 500 / very slow: too many DB connections — deploy uses max_connections=400 + DB_POOL_SIZE=5 per pod (k8s/01-configmap.yml, k8s/deploy.sh); lower STRESS_CONCURRENCY or raise max_connections / Helm memory.
node tests/stress/run-stress.mjs
# Optional heavy mode (POST bookings — uses Kafka/DB):
# STRESS_INCLUDE_BOOKINGS=1 STRESS_REQUESTS=200 node tests/stress/run-stress.mjs
```

## Postgres & connection pool (stress)

High concurrency can exceed PostgreSQL `max_connections` (many pods × TypeORM pools). The repo sets **`max_connections=400`** (Helm / Compose) and **`DB_POOL_SIZE=5`** per pod via `k8s/01-configmap.yml` + TypeORM `poolSize`. Apply changes with the steps below.

### Kubernetes (step by step)

From the repo root:

```bash
cd /path/to/airline-booking
export NAMESPACE=airline

helm repo add bitnami https://charts.bitnami.com/bitnami --force-update
helm repo update

helm upgrade --install postgres bitnami/postgresql \
  --namespace "$NAMESPACE" \
  --set auth.postgresPassword=postgres \
  --set primary.persistence.size=2Gi \
  --set-string primary.extendedConfiguration="max_connections=400" \
  --set primary.resources.requests.memory=512Mi \
  --set primary.resources.requests.cpu=250m \
  --set primary.resources.limits.memory=2Gi \
  --set primary.resources.limits.cpu=2000m \
  --wait --timeout=10m

kubectl get pods -n "$NAMESPACE" -l app.kubernetes.io/name=postgresql

kubectl apply -f k8s/01-configmap.yml

kubectl rollout restart deployment/booking-service deployment/inventory-service deployment/pricing-service -n "$NAMESPACE"

kubectl rollout status deployment/booking-service -n "$NAMESPACE" --timeout=5m
kubectl rollout status deployment/inventory-service -n "$NAMESPACE" --timeout=5m
kubectl rollout status deployment/pricing-service -n "$NAMESPACE" --timeout=5m
```

Verify `max_connections` (should print `400`):

```bash
kubectl exec -n "$NAMESPACE" postgres-postgresql-0 -- bash -c 'echo "SHOW max_connections;" | PGPASSWORD=postgres psql -U postgres -t'
```

Stress example (lower concurrency first if the DB still struggles):

```bash
STRESS_REQUESTS=600000 STRESS_CONCURRENCY=200 STRESS_BASE_URL=http://airline.local node tests/stress/run-stress.mjs
```

If you changed **service code** (e.g. `poolSize` in `app.module.ts`), rebuild images then restart (same namespace):

```bash
docker build -t airline/booking-service:latest ./booking-service
docker build -t airline/inventory-service:latest ./inventory-service
docker build -t airline/pricing-service:latest ./pricing-service

kubectl rollout restart deployment/booking-service deployment/inventory-service deployment/pricing-service -n airline
```

### Docker Compose (step by step)

```bash
cd /path/to/airline-booking

docker compose up -d --force-recreate postgres

docker compose build booking-service inventory-service pricing-service
docker compose up -d booking-service inventory-service pricing-service
```

Optional: confirm setting:

```bash
docker compose exec postgres psql -U postgres -c "SHOW max_connections;"
```

**Note:** A full `docker compose down` + removing the `postgres_data` volume wipes DB data — only if you need a clean database.

## Kafka consumers (stress / rebalancing)

Under heavy load, consumer groups can **rebalance** (partition reassignment) and briefly stall consumption or log heartbeat warnings.

**Mitigations in this repo:**

1. **More topic partitions** — Job `k8s/00c-kafka-topics.yml` widens high-traffic saga topics to **12 partitions** (`booking.failed` stays **1** — rare events; single-broker Redpanda can hit `INVALID_PARTITIONS` / hardware limits if every topic is scaled to 12). `k8s/deploy.sh` runs it after Kafka is ready.

   On an **already running** cluster (after pulling these changes):

   ```bash
   kubectl delete job kafka-init-topics -n airline --ignore-not-found
   kubectl apply -f k8s/00c-kafka-topics.yml
   kubectl wait --for=condition=complete job/kafka-init-topics -n airline --timeout=5m
   kubectl logs job/kafka-init-topics -n airline
   ```

2. **Handlers** — Keep `@EventPattern` work **short** and **idempotent** so `poll`/heartbeats stay healthy during load.

3. **Consumer `run` + graceful shutdown** (each service `main.ts`):
   - `run: { partitionsConsumedConcurrently: 1 }` — one in-flight batch per poll so the client can **finish work and rejoin** faster under rebalance.
   - `app.enableShutdownHooks()` — on **Kubernetes** pod termination (`SIGTERM`), Nest disconnects the Kafka consumer **before** exit so the broker does not wait for **session timeout** to evict the member (reduces “stuck” group rebalances).

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

# Rebuild + redeploy tất cả app services — xem mục "Rebuild & redeploy (Kubernetes)" phía trên

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
| `k8s/00c-kafka-topics.yml` | Job `rpk`: saga topics → 12 partitions (`booking.failed` = 1); giảm rebalance khi nhiều consumer |
| `k8s/01-configmap.yml` | Shared config (Kafka, Redis, ES, `DB_POOL_SIZE`, …) |
| `k8s/02-secrets.yml` | Database URLs, JWT secret |
| `k8s/03-booking-service.yml` | Deployment + Service (fixed replicas; no HPA) |
| `k8s/04-inventory-service.yml` | Deployment + Service (fixed replicas; no HPA) |
| `k8s/05-search-service.yml` | Deployment + Service (fixed replicas; no HPA) |
| `k8s/06-pricing-notification.yml` | pricing-service + notification-service |
| `k8s/07-ingress.yml` | Nginx Ingress rules |
| `k8s/kafka.yml` | Redpanda StatefulSet + Service |
| `k8s/elasticsearch.yml` | Elasticsearch StatefulSet + Service |
