#!/bin/bash
# deploy.sh — Script deploy toàn bộ airline booking lên K8s local
# Usage: ./k8s/deploy.sh [minikube|docker-desktop]
# Run from any cwd: paths resolve from this script’s directory.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

PLATFORM=${1:-docker-desktop}
NAMESPACE=airline

echo "=== 🚀 Airline Booking — K8s Deploy ==="
echo "Platform: $PLATFORM"
echo ""

# ─── 1. Build Docker images ───────────────────────────────────────
echo "📦 Building Docker images..."
docker build -f ./booking-service/Dockerfile  -t airline/booking-service:latest . --quiet
docker build -f ./inventory-service/Dockerfile  -t airline/inventory-service:latest . --quiet
docker build -f ./search-service/Dockerfile  -t airline/search-service:latest . --quiet
docker build -f ./pricing-service/Dockerfile  -t airline/pricing-service:latest . --quiet
docker build -f ./notification-service/Dockerfile -t airline/notification-service:latest . --quiet
echo "✅ Images built"

# ─── 2. Load vào minikube nếu cần ────────────────────────────────
if [ "$PLATFORM" = "minikube" ]; then
  echo "📤 Loading images into minikube..."
  minikube image load airline/booking-service:latest
  minikube image load airline/inventory-service:latest
  minikube image load airline/search-service:latest
  minikube image load airline/pricing-service:latest
  minikube image load airline/notification-service:latest
  echo "✅ Images loaded into minikube"
fi

# ─── 3. Nginx Ingress Controller ─────────────────────────────────
echo ""
echo "🌐 Installing Nginx Ingress Controller..."
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.11.3/deploy/static/provider/cloud/deploy.yaml > /dev/null
kubectl rollout status deployment/ingress-nginx-controller -n ingress-nginx --timeout=3m
echo "✅ Ingress controller ready"

# ─── 4. Cài infrastructure qua Helm ─────────────────────────────
echo ""
echo "🔧 Installing infrastructure via Helm..."
helm repo add bitnami https://charts.bitnami.com/bitnami --force-update > /dev/null
helm repo update > /dev/null

# PostgreSQL
# Primary: higher max_connections for many app pods × TypeORM pools; memory for shared_buffers
helm upgrade --install postgres bitnami/postgresql \
  --namespace $NAMESPACE --create-namespace \
  --set auth.postgresPassword=postgres \
  --set primary.persistence.size=2Gi \
  --set-string primary.extendedConfiguration="max_connections=400" \
  --set primary.resources.requests.memory=512Mi \
  --set primary.resources.requests.cpu=250m \
  --set primary.resources.limits.memory=2Gi \
  --set primary.resources.limits.cpu=2000m \
  --wait --timeout=5m

# Redis
helm upgrade --install redis bitnami/redis \
  --namespace $NAMESPACE \
  --set auth.enabled=false \
  --set master.persistence.size=1Gi \
  --wait --timeout=3m

# Kafka (official apache/kafka image — KRaft, no Zookeeper)
kubectl apply -f k8s/kafka.yml
kubectl rollout status statefulset/kafka -n $NAMESPACE --timeout=5m

echo ""
echo "📨 Kafka topics — ensure 12 partitions (multi-replica consumers)..."
kubectl delete job kafka-init-topics -n $NAMESPACE --ignore-not-found
kubectl apply -f k8s/00c-kafka-topics.yml
kubectl wait --for=condition=complete job/kafka-init-topics -n $NAMESPACE --timeout=5m

# Elasticsearch (official elastic image — security disabled for local dev)
kubectl apply -f k8s/elasticsearch.yml
kubectl rollout status statefulset/elasticsearch -n $NAMESPACE --timeout=5m

echo "✅ Infrastructure ready"

# ─── 3b. Create application databases ────────────────────────────
echo ""
echo "🗄️  Creating application databases..."
kubectl delete job init-databases -n $NAMESPACE --ignore-not-found
kubectl apply -f k8s/00b-init-db.yml
kubectl wait --for=condition=complete job/init-databases -n $NAMESPACE --timeout=3m
echo "✅ Databases ready"

# ─── 4. Apply K8s manifests ──────────────────────────────────────
echo ""
echo "📋 Applying K8s manifests..."
kubectl apply -f k8s/00-namespace.yml
kubectl apply -f k8s/01-configmap.yml
kubectl apply -f k8s/02-secrets.yml
kubectl apply -f k8s/03-booking-service.yml
kubectl apply -f k8s/04-inventory-service.yml
kubectl apply -f k8s/05-search-service.yml
kubectl apply -f k8s/06-pricing-notification.yml
kubectl apply -f k8s/07-ingress.yml

# Remove legacy HPAs (no longer in manifests — apply alone does not delete them)
kubectl delete hpa booking-hpa inventory-hpa search-hpa -n $NAMESPACE --ignore-not-found

# ─── 4b. Restart app pods (imagePullPolicy: Never + :latest — pick up rebuilt images)
echo ""
echo "🔄 Restarting app deployments to load new local images..."
for d in booking-service inventory-service search-service pricing-service notification-service; do
  kubectl rollout restart deployment/"$d" -n $NAMESPACE 2>/dev/null || true
done

# ─── 5. Chờ services ready ───────────────────────────────────────
echo ""
echo "⏳ Waiting for services to be ready..."
kubectl rollout status deployment/booking-service      -n $NAMESPACE
kubectl rollout status deployment/inventory-service  -n $NAMESPACE
kubectl rollout status deployment/search-service     -n $NAMESPACE
kubectl rollout status deployment/pricing-service    -n $NAMESPACE
kubectl rollout status deployment/notification-service -n $NAMESPACE

# ─── 6. In thông tin access ──────────────────────────────────────
echo ""
echo "=== ✅ Deploy thành công! ==="
echo ""
echo "📌 Thêm vào /etc/hosts (hoặc hosts file trên Windows):"
echo "   127.0.0.1 airline.local"
echo ""
echo "🌐 Endpoints:"
echo "   Search:  http://airline.local/api/search/flights?from=SGN&to=HAN&date=2024-12-20"
echo "   Booking: http://airline.local/api/bookings"
echo ""
echo "🔍 Port-forward để debug trực tiếp:"
echo "   kubectl port-forward svc/booking-service   3001:3001 -n $NAMESPACE"
echo "   kubectl port-forward svc/inventory-service 3002:3002 -n $NAMESPACE"
echo "   kubectl port-forward svc/search-service    3003:3003 -n $NAMESPACE"
echo ""
echo "📊 Xem trạng thái:"
echo "   kubectl get all -n $NAMESPACE"
