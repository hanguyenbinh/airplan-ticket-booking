# Tài liệu chuẩn bị phỏng vấn Backend Microservices

> Mục tiêu: Chuẩn bị đầy đủ kiến thức và kỹ năng để vượt qua phỏng vấn vị trí Backend Microservices, từ cơ bản đến nâng cao.

---

## Mục lục

1. [Kiến trúc Microservices](#1-kiến-trúc-microservices)
2. [Communication giữa các Service](#2-communication-giữa-các-service)
3. [Data Management](#3-data-management)
4. [Resilience & Fault Tolerance](#4-resilience--fault-tolerance)
5. [API Gateway & Service Discovery](#5-api-gateway--service-discovery)
6. [Security](#6-security)
7. [Observability](#7-observability)
8. [Deployment & DevOps](#8-deployment--devops)
9. [Câu hỏi tình huống thực tế](#9-câu-hỏi-tình-huống-thực-tế)
10. [Câu hỏi về kinh nghiệm cá nhân](#10-câu-hỏi-về-kinh-nghiệm-cá-nhân)
11. [Kế hoạch ôn tập](#11-kế-hoạch-ôn-tập)

---

## 1. Kiến trúc Microservices

### Câu hỏi cơ bản

**Q: Microservices khác gì so với Monolithic?**

| | Monolithic | Microservices |
|---|---|---|
| Triển khai | Deploy toàn bộ | Deploy từng service |
| Scale | Scale toàn bộ app | Scale từng service độc lập |
| Fault isolation | Một lỗi có thể sập toàn bộ | Lỗi được cô lập theo service |
| Complexity | Đơn giản ban đầu | Phức tạp về mặt vận hành |
| Team | Một team lớn | Nhiều team nhỏ độc lập |
| Technology | Một tech stack | Mỗi service có thể khác nhau |

**Q: Khi nào nên dùng Microservices, khi nào không nên?**

- **Nên dùng khi:** Team lớn, hệ thống phức tạp, cần scale độc lập từng phần, domain rõ ràng
- **Không nên dùng khi:** Startup giai đoạn đầu, team nhỏ, domain chưa rõ ràng, không có DevOps mature

---

### Câu hỏi khó

**Q: Làm thế nào để phân chia service boundary?**

- Dùng **Domain-Driven Design (DDD)** và **Bounded Context**
- Mỗi service nên map với một Bounded Context
- Nguyên tắc: high cohesion, low coupling
- Tránh phân chia theo layer kỹ thuật (không nên tách service "database layer")
- Phân chia theo business capability (Order Service, Payment Service, User Service...)

**Q: Distributed Monolith là gì? Làm sao tránh?**

- **Định nghĩa:** Hệ thống được triển khai như microservices nhưng các service phụ thuộc nhau chặt chẽ — nếu một service thay đổi, phải deploy lại nhiều service khác
- **Dấu hiệu nhận biết:**
  - Services gọi nhau đồng bộ quá nhiều
  - Shared database giữa nhiều service
  - Deploy phải theo thứ tự cụ thể
- **Cách tránh:**
  - Mỗi service có database riêng
  - Giao tiếp bất đồng bộ qua message queue
  - Định nghĩa rõ API contract và versioning

**Q: Cascade failure là gì? Giải pháp?**

- **Vấn đề:** Service A gọi B → B gọi C → C gọi D → D chậm → toàn bộ hệ thống bị block
- **Giải pháp:**
  - **Circuit Breaker:** Ngắt kết nối khi phát hiện lỗi liên tục
  - **Timeout:** Đặt giới hạn thời gian chờ
  - **Bulkhead:** Cô lập tài nguyên (thread pool riêng cho từng dependency)
  - **Fallback:** Trả về giá trị mặc định khi service phụ thuộc lỗi

---

## 2. Communication giữa các Service

### Câu hỏi cơ bản

**Q: Synchronous vs Asynchronous — khi nào dùng?**

| | Synchronous (REST, gRPC) | Asynchronous (Kafka, RabbitMQ) |
|---|---|---|
| Khi dùng | Cần kết quả ngay | Không cần kết quả ngay |
| Ví dụ | Đăng nhập, tra cứu sản phẩm | Gửi email, xử lý đơn hàng |
| Ưu điểm | Đơn giản, dễ debug | Loose coupling, resilient |
| Nhược điểm | Coupling chặt, dễ cascade | Phức tạp hơn, eventual consistency |

**Q: REST vs gRPC — so sánh?**

| | REST | gRPC |
|---|---|---|
| Protocol | HTTP/1.1 | HTTP/2 |
| Format | JSON (text) | Protobuf (binary) |
| Performance | Chậm hơn | Nhanh hơn (~5-10x) |
| Browser support | Tốt | Hạn chế |
| Streaming | Không native | Hỗ trợ bidirectional |
| Dùng khi | External API, public API | Internal service-to-service |

---

### Câu hỏi khó

**Q: Choreography vs Orchestration — sự khác biệt?**

- **Choreography (Vũ điệu):**
  - Mỗi service tự biết phải làm gì khi nhận event
  - Không có trung tâm điều phối
  - Ưu: loose coupling, không có SPOF
  - Nhược: Khó theo dõi toàn bộ flow, logic phân tán

- **Orchestration (Điều phối):**
  - Một Orchestrator (Saga Orchestrator) điều phối các service
  - Orchestrator biết toàn bộ flow
  - Ưu: Dễ hiểu flow, dễ xử lý lỗi tập trung
  - Nhược: Orchestrator có thể trở thành bottleneck

**Q: Làm sao đảm bảo idempotency khi retry?**

- Mỗi message/request phải có **idempotency key** (unique ID)
- Consumer kiểm tra ID trong database trước khi xử lý
- Nếu đã xử lý rồi → bỏ qua, trả về kết quả cũ
- Dùng **Redis** hoặc **database** để lưu danh sách processed IDs

**Q: Exactly-once delivery có thực sự đạt được không?**

- **Lý thuyết:** Rất khó đạt được truly exactly-once trong distributed systems
- **Thực tế:** Kafka hỗ trợ exactly-once semantics (EOS) trong một Kafka cluster
- **Giải pháp thực tế:** Thiết kế consumer **idempotent** để at-least-once delivery không gây vấn đề

**Q: Transactional Outbox Pattern là gì?**

- **Vấn đề:** Service publish event thành công nhưng database chưa commit (hoặc ngược lại)
- **Giải pháp Outbox Pattern:**
  1. Lưu event vào bảng `outbox` trong **cùng transaction** với data
  2. Một **Message Relay** (background job) đọc bảng outbox và publish lên message broker
  3. Sau khi publish thành công → đánh dấu event đã gửi
- **Kết quả:** Đảm bảo data và event luôn nhất quán

---

## 3. Data Management

### Câu hỏi khó

**Q: Tại sao mỗi service nên có database riêng?**

- **Lý do:**
  - Độc lập về schema — thay đổi không ảnh hưởng service khác
  - Mỗi service chọn database phù hợp (SQL, NoSQL, Graph...)
  - Tránh coupling qua shared database
- **Nhược điểm:**
  - Khó query dữ liệu từ nhiều service
  - Không có ACID transaction xuyên service
  - Cần xử lý eventual consistency

**Q: Distributed Transaction — xử lý thế nào? (Saga Pattern)**

**Saga Pattern** là chuỗi local transaction, mỗi bước publish event kích hoạt bước tiếp theo.

```
Saga: Đặt hàng
1. Order Service: Tạo đơn hàng (PENDING)
2. Payment Service: Trừ tiền
3. Inventory Service: Trừ tồn kho
4. Order Service: Cập nhật trạng thái (CONFIRMED)
```

**Compensating Transaction** khi có lỗi:
```
Lỗi ở bước 3 (Inventory):
← Inventory Service: Không trừ tồn kho
← Payment Service: Hoàn tiền (compensate)
← Order Service: Hủy đơn hàng
```

**Q: CQRS là gì? Khi nào dùng?**

- **CQRS = Command Query Responsibility Segregation**
- Tách riêng model cho **Write (Command)** và **Read (Query)**
- **Write model:** Optimize cho tính nhất quán
- **Read model:** Optimize cho hiệu năng đọc (denormalized, cached)
- **Khi nào dùng:** Read và Write có tỉ lệ chênh lệch lớn, cần scale khác nhau
- **Nhược điểm:** Eventual consistency, phức tạp hơn

**Q: Event Sourcing là gì?**

- Thay vì lưu **trạng thái hiện tại**, lưu **toàn bộ sự kiện** đã xảy ra
- Trạng thái hiện tại = replay toàn bộ event từ đầu
- **Ưu điểm:** Audit log đầy đủ, có thể replay history, kết hợp tốt với CQRS
- **Nhược điểm:** Phức tạp, query state phức tạp, event schema migration khó

**Q: Làm sao query dữ liệu từ nhiều service?**

- **API Composition:** API Gateway gọi nhiều service và merge kết quả
  - Đơn giản, nhưng chậm nếu cần join phức tạp
- **CQRS Read Model:** Tạo một read-optimized view tổng hợp từ nhiều service
  - Nhanh, nhưng eventual consistency
- **GraphQL Federation:** Mỗi service expose GraphQL schema riêng

---

## 4. Resilience & Fault Tolerance

### Câu hỏi khó

**Q: Circuit Breaker hoạt động như thế nào?**

```
CLOSED (Bình thường)
  ↓ Lỗi vượt ngưỡng (vd: 50% trong 10s)
OPEN (Ngắt mạch — không gọi service nữa, trả lỗi ngay)
  ↓ Sau timeout (vd: 30s)
HALF-OPEN (Thử một số request)
  ↓ Thành công → CLOSED
  ↓ Thất bại → OPEN lại
```

- **Thư viện phổ biến:** Resilience4j (Java), Polly (.NET), `circuit-breaker` (Node.js)

**Q: Bulkhead Pattern là gì?**

- Lấy cảm hứng từ vách ngăn tàu thủy — ngăn nước tràn từ khoang này sang khoang khác
- **Ý tưởng:** Cô lập tài nguyên (thread pool, connection pool) cho từng dependency
- **Ví dụ:** Service A gọi B và C, mỗi dependency có thread pool riêng
  - Nếu B chậm và làm cạn thread pool của B → C vẫn hoạt động bình thường

**Q: Retry với Exponential Backoff + Jitter — tại sao cần Jitter?**

- **Exponential Backoff:** Tăng thời gian chờ theo cấp số nhân (1s, 2s, 4s, 8s...)
- **Vấn đề:** Nếu nhiều client cùng retry đúng lúc → **thundering herd** → server bị quá tải lại
- **Jitter:** Thêm random delay để các client không retry cùng lúc
  - `wait = random(0, min(cap, base * 2^attempt))`

**Q: Deadline Propagation là gì?**

- Khi request có deadline (timeout) từ client, deadline này cần được **truyền xuống** tất cả các service phụ thuộc
- Nếu request còn 100ms → service B biết chỉ còn 100ms để xử lý, không cần làm thêm
- Tránh tình trạng: service A timeout nhưng B, C, D vẫn đang xử lý tốn tài nguyên

**Q: Xử lý partial failure trong workflow nhiều bước?**

- Dùng **Saga Pattern** với compensating transactions
- Thiết kế workflow **idempotent** để có thể retry an toàn
- Dùng **Dead Letter Queue** cho các message không xử lý được
- Có cơ chế **manual intervention** cho các trường hợp không thể tự recover

---

## 5. API Gateway & Service Discovery

### Câu hỏi cơ bản

**Q: API Gateway làm gì?**

- **Routing:** Điều hướng request đến đúng service
- **Authentication/Authorization:** Xác thực token trước khi vào service
- **Rate Limiting:** Giới hạn số request
- **Load Balancing:** Phân tải
- **SSL Termination:** Xử lý HTTPS
- **Logging/Monitoring:** Ghi log tập trung
- **Caching:** Cache response

**Q: Client-side vs Server-side Service Discovery?**

| | Client-side | Server-side |
|---|---|---|
| Ví dụ | Netflix Eureka + Ribbon | AWS ELB, Kubernetes Service |
| Client biết | Danh sách service instances | Chỉ biết một endpoint |
| Load balancing | Client tự làm | Load balancer làm |
| Phức tạp | Client phức tạp hơn | Client đơn giản hơn |

---

### Câu hỏi khó

**Q: Nếu API Gateway là single point of failure — xử lý thế nào?**

- Deploy **multiple instances** của API Gateway
- Dùng **Load Balancer** trước API Gateway
- **Active-Active** deployment
- Health check và auto-restart
- **Failover** tự động

**Q: Rate Limiting — thuật toán nào?**

| Thuật toán | Mô tả | Ưu/Nhược |
|---|---|---|
| **Token Bucket** | Bucket chứa token, mỗi request tiêu 1 token, token được refill đều đặn | Cho phép burst ngắn |
| **Leaky Bucket** | Request vào queue, xử lý đều đặn như nước chảy | Smooth output, không burst |
| **Fixed Window** | Đếm request trong cửa sổ thời gian cố định | Đơn giản, nhưng edge case ở ranh giới window |
| **Sliding Window** | Cửa sổ di chuyển liên tục | Chính xác hơn, tốn memory hơn |

**Q: Backend for Frontend (BFF) Pattern là gì?**

- Tạo một API Gateway **riêng cho từng loại client** (Web, Mobile, Third-party)
- Mỗi BFF tổng hợp và format data phù hợp với client của nó
- **Ưu điểm:** Optimize payload cho từng client, team frontend tự quản lý BFF
- **Nhược điểm:** Có thể duplicate logic giữa các BFF

---

## 6. Security

### Câu hỏi khó

**Q: Authenticate giữa các internal service thế nào?**

- **mTLS (Mutual TLS):** Cả hai bên xác thực nhau bằng certificate
  - An toàn nhất, thường dùng với Service Mesh (Istio)
- **JWT:** Service A ký JWT → Service B verify
  - Đơn giản, nhưng cần quản lý key rotation
- **API Key:** Đơn giản nhưng kém linh hoạt
- **Service Mesh (Istio/Linkerd):** Tự động inject mTLS, không cần code

**Q: Zero Trust Network trong microservices?**

- **Nguyên tắc:** "Never trust, always verify" — ngay cả traffic internal cũng phải authenticate
- Không có "trusted zone" bên trong network
- Mỗi service-to-service call phải được xác thực và authorized
- Implement: mTLS + RBAC + least privilege

**Q: JWT bị lộ — làm sao revoke trước khi hết hạn?**

- **Blacklist approach:** Lưu danh sách revoked token trong Redis, check mỗi request
  - Đơn giản nhưng tốn tài nguyên
- **Short-lived JWT + Refresh Token:** Access token TTL ngắn (5-15 phút), dùng refresh token để lấy token mới
  - Revoke refresh token để dừng cấp token mới
- **Token Introspection (OAuth2):** Mỗi request hỏi Authorization Server xem token có valid không
  - An toàn nhất nhưng có latency

**Q: OAuth2 flow nào cho service-to-service?**

- **Client Credentials Flow:** Service A lấy token từ Auth Server bằng client_id + client_secret → gọi Service B với token đó
- Không có user involvement
- Token có scope giới hạn (least privilege)

---

## 7. Observability

### Câu hỏi khó

**Q: 3 trụ cột của Observability?**

| Trụ cột | Công cụ phổ biến | Dùng để |
|---|---|---|
| **Metrics** | Prometheus, Grafana | Theo dõi số liệu (latency, error rate, throughput) |
| **Logs** | ELK Stack, Loki | Debug lỗi cụ thể, audit trail |
| **Traces** | Jaeger, Zipkin, OpenTelemetry | Theo dõi một request qua nhiều service |

**Q: Distributed Tracing hoạt động thế nào?**

- Mỗi request được gán một **Trace ID** duy nhất
- Mỗi service tạo ra **Span** (đơn vị công việc) với thông tin: thời gian bắt đầu, kết thúc, metadata
- **Trace ID và Span ID** được truyền qua HTTP headers (`X-Trace-Id`, `X-Span-Id`)
- Toàn bộ Spans của một Trace ID tạo thành một **DAG (Directed Acyclic Graph)** — có thể visualize

```
Request → [Service A: Span 1]
                ↓
          [Service B: Span 2]
          [Service C: Span 3]
                ↓
          [DB: Span 4]
```

**Q: Làm sao debug request chậm qua 10 service?**

1. Dùng **Distributed Tracing** để xem Span nào tốn thời gian nhất
2. Nhìn vào **flame graph** của trace
3. Check **metrics** của service bị chậm (CPU, memory, DB connections)
4. Xem **structured logs** của service đó tại thời điểm xảy ra
5. Check **downstream dependencies** của service đó

**Q: Structured Logging là gì và tại sao quan trọng?**

- Log theo format có cấu trúc (JSON) thay vì plain text
- Dễ **query và filter** trong log aggregation system
- Bắt buộc có: `timestamp`, `level`, `service`, `traceId`, `spanId`, `message`

```json
{
  "timestamp": "2026-04-19T10:00:00Z",
  "level": "ERROR",
  "service": "order-service",
  "traceId": "abc123",
  "spanId": "def456",
  "userId": "user-789",
  "message": "Failed to process payment",
  "error": "ConnectionTimeout"
}
```

---

## 8. Deployment & DevOps

### Câu hỏi cơ bản

**Q: CI/CD pipeline cho microservices trông như thế nào?**

```
Code Push → Lint/Test → Build Docker Image → Push to Registry
→ Deploy to Staging → Integration Test → Deploy to Production
```

- Mỗi service có pipeline riêng độc lập
- **Trunk-based development** hoặc **GitFlow**
- **Feature flags** để deploy không release

**Q: Kubernetes cơ bản?**

| Khái niệm | Mô tả |
|---|---|
| **Pod** | Đơn vị nhỏ nhất, chứa 1+ container |
| **Deployment** | Quản lý Pod replicas, rolling update |
| **Service** | Load balancer nội bộ, stable DNS name |
| **Ingress** | HTTP routing vào cluster |
| **ConfigMap/Secret** | Cấu hình và credentials |
| **HPA** | Horizontal Pod Autoscaler — tự scale |

---

### Câu hỏi khó

**Q: Blue-Green vs Canary Deployment?**

| | Blue-Green | Canary |
|---|---|---|
| **Cách hoạt động** | Duy trì 2 môi trường, switch traffic | Rollout dần dần (5% → 25% → 100%) |
| **Rollback** | Instant (switch lại) | Cần giảm traffic về 0% |
| **Chi phí** | Tốn gấp đôi resource | Tốn ít hơn |
| **Khi dùng** | Cần zero-downtime, rollback nhanh | Muốn test với subset user thật |

**Q: Service Mesh giải quyết vấn đề gì mà code không thể?**

- **mTLS tự động** giữa tất cả services — không cần code
- **Traffic management:** Retry, Circuit Breaker, Timeout ở infra layer
- **Observability tự động:** Metrics, traces mà không cần instrument code
- **Traffic splitting:** Canary deployment ở layer network
- **Ví dụ:** Istio, Linkerd, Consul Connect

---

## 9. Câu hỏi tình huống thực tế

### Tình huống 1: Service A cần đọc data của Service B liên tục

**Đặt vấn đề:** Nếu A gọi B mỗi request → coupling chặt, B là bottleneck

**Giải pháp:**
- **Nếu data ít thay đổi:** A cache data của B (TTL-based hoặc event-driven invalidation)
- **CQRS Read Model:** B publish event khi data thay đổi → A subscribe và build read model riêng
- **Data Replication:** B sync data sang database riêng của A (eventual consistency)
- **Direct call (cuối cùng):** Chỉ khi cần real-time và chấp nhận coupling

---

### Tình huống 2: Hệ thống bị chậm đột ngột, không biết ở service nào

**Quy trình debug:**
1. Mở **Grafana dashboard** — xem metrics tổng quan (latency, error rate, throughput)
2. Dùng **Distributed Tracing (Jaeger)** — tìm trace có latency cao
3. Phân tích **flame graph** — xác định service/span chậm nhất
4. Xem **logs** của service đó — tìm error hoặc slow query
5. Check **resource usage** (CPU, memory, DB connection pool)
6. Check **downstream dependencies** của service đó

---

### Tình huống 3: Database của một service bị down

**Xử lý ngắn hạn:**
- **Circuit Breaker** ngắt các call đến service đó
- Service return **fallback response** (cached data hoặc default value)
- **Graceful degradation:** Ẩn tính năng liên quan, không crash toàn bộ

**Xử lý dài hạn:**
- **Database replication** với read replicas
- **Multi-region failover**
- **Connection pooling** và retry với backoff

---

### Tình huống 4: Thay đổi database schema không downtime

**Expand-Contract Pattern (aka Parallel Change):**

```
Bước 1 - EXPAND: Thêm column mới, giữ column cũ
  → Deploy service version mới (đọc column mới, ghi cả 2)

Bước 2 - MIGRATE: Migrate data từ column cũ sang mới

Bước 3 - CONTRACT: Xóa column cũ sau khi verify
  → Deploy service version cuối (chỉ dùng column mới)
```

---

### Tình huống 5: Message queue bị overflow

**Nguyên nhân:** Consumer xử lý chậm hơn Producer

**Giải pháp:**
- **Scale consumers:** Tăng số lượng consumer instances
- **Backpressure:** Producer giảm tốc độ gửi khi queue đầy
- **Dead Letter Queue (DLQ):** Message failed nhiều lần → chuyển vào DLQ để xử lý sau
- **Message TTL:** Set thời gian hết hạn cho message cũ
- **Priority Queue:** Message quan trọng được xử lý trước

---

## 10. Câu hỏi về kinh nghiệm cá nhân

### Câu hỏi hay gặp và cách trả lời

**Q: Dự án microservices khó nhất bạn từng làm?**

*Gợi ý trả lời theo STAR method:*
- **Situation:** Bối cảnh dự án
- **Task:** Nhiệm vụ của bạn
- **Action:** Bạn đã làm gì cụ thể
- **Result:** Kết quả đạt được

**Q: Bạn chọn Kafka hay RabbitMQ? Tại sao?**

| | Kafka | RabbitMQ |
|---|---|---|
| **Paradigm** | Log-based (pull) | Message queue (push) |
| **Throughput** | Rất cao (triệu msg/s) | Cao (hàng chục nghìn/s) |
| **Retention** | Lưu trữ lâu dài (replay được) | Xóa sau khi consume |
| **Use case** | Event streaming, audit log, analytics | Task queue, RPC, routing phức tạp |
| **Complexity** | Phức tạp hơn | Đơn giản hơn |

> Không có câu trả lời đúng tuyệt đối — interviewer muốn nghe **lý luận** của bạn dựa trên use case cụ thể.

**Q: Bạn debug race condition trong distributed system thế nào?**

- Xem xét **thứ tự xử lý event** — có đảm bảo ordering không?
- Dùng **optimistic locking** hoặc **pessimistic locking**
- Thiết kế **idempotent operations** — xử lý nhiều lần cũng cho kết quả như nhau
- Dùng **distributed lock** (Redis Redlock) khi cần critical section

---

## 11. Kế hoạch ôn tập

### Phân theo tuần (4 tuần)

#### Tuần 1 — Nền tảng
- [ ] Đọc kỹ về Microservices vs Monolithic
- [ ] Hiểu DDD và Bounded Context
- [ ] Nắm vững REST và gRPC
- [ ] Ôn lại Docker cơ bản

#### Tuần 2 — Patterns cốt lõi
- [ ] **Saga Pattern** — Choreography và Orchestration (quan trọng nhất)
- [ ] **CQRS và Event Sourcing**
- [ ] **Circuit Breaker** và Resilience patterns
- [ ] **Transactional Outbox Pattern**

#### Tuần 3 — Infra và Operations
- [ ] Kubernetes cơ bản (Pod, Deployment, Service, Ingress)
- [ ] **Distributed Tracing** với OpenTelemetry
- [ ] API Gateway patterns (BFF, Rate Limiting)
- [ ] Security: mTLS, JWT, OAuth2 Client Credentials

#### Tuần 4 — Thực hành và tình huống
- [ ] Giải các bài tập design hệ thống microservices
- [ ] Luyện tập câu hỏi theo STAR method
- [ ] Mock interview với các câu hỏi khó
- [ ] Review và củng cố điểm yếu

---

### Tài liệu tham khảo

- **Sách:** "Building Microservices" - Sam Newman (bắt buộc đọc)
- **Sách:** "Designing Distributed Systems" - Brendan Burns
- **Blog:** [martinfowler.com](https://martinfowler.com) (các pattern cốt lõi)
- **Course:** Chris Richardson - [microservices.io](https://microservices.io) (patterns catalog)
- **Tool thực hành:** Docker + Docker Compose + Kubernetes (minikube)

---

### Checklist trước phỏng vấn

- [ ] Có thể giải thích Saga Pattern bằng ví dụ cụ thể
- [ ] Biết khi nào dùng Kafka vs RabbitMQ và lý do
- [ ] Hiểu Circuit Breaker 3 trạng thái
- [ ] Nắm được 3 trụ cột Observability
- [ ] Có ít nhất 1-2 câu chuyện thực tế từ kinh nghiệm bản thân
- [ ] Hiểu Kubernetes đủ để nói chuyện với DevOps team
- [ ] Biết trade-off của CQRS và Event Sourcing

---

*Tài liệu này được tạo ngày 19/04/2026. Cập nhật theo kinh nghiệm thực tế.*
