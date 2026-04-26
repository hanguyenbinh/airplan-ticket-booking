Để giải quyết triệt để vấn đề Rebalance khi dùng HPA, bạn hãy thực hiện 2 thay đổi "vàng" sau đây:
1. Chuyển sang CooperativeStickyAssignor
Đây là ưu tiên số 1. Thay vì dừng toàn bộ Group, nó chỉ di chuyển các Partition cần thiết từ Consumer cũ sang Consumer mới.
Cấu hình (Java/Spring Boot):
properties
spring.kafka.consumer.properties.partition.assignment.strategy=org.apache.kafka.clients.consumer.CooperativeStickyAssignor
Hãy thận trọng khi sử dụng mã.
Cấu hình (Python - confluent-kafka):
python
'partition.assignment.strategy': 'cooperative-sticky'
Hãy thận trọng khi sử dụng mã.
2. Sử dụng KEDA để Scale theo "Consumer Lag"
HPA mặc định của Kubernetes chỉ nhìn vào CPU/RAM. Nhưng với Kafka, CPU có thể thấp nhưng Lag (tin nhắn tồn đọng) lại rất cao. Việc dùng KEDA (Kubernetes Event-driven Autoscaling) giúp HPA "thông minh" hơn:
Tại sao cần KEDA? Nó giúp HPA biết chính xác khi nào lượng tin nhắn đổ về quá lớn để scale up trước khi hệ thống bị nghẽn hoàn toàn.
Trigger: Bạn cấu hình KEDA theo dõi consumer lag. Ví dụ: "Nếu lag > 10,000 tin nhắn, hãy thêm 1 Pod mới".
Một lưu ý quan trọng khác:
Khi HPA scale up, đừng quên giới hạn Max Pods bằng với số lượng Partitions.
Trong ví dụ trước bạn có 20 partitions.
Nếu HPA scale lên 21 Pods, thì Pod thứ 21 sẽ ngồi chơi xơi nước vì không còn partition nào để nhận.


1. Vấn đề về Rebalancing & Consumer (Nhóm hay gặp nhất)
Stop-the-world Rebalance: Toàn bộ consumer dừng xử lý để chia lại partition.
Rebalance Cascade: Rebalance kéo dài làm timeout, gây ra đợt rebalance tiếp theo liên tục.
Consumer Lag: Tốc độ xử lý của Consumer chậm hơn tốc độ đẩy dữ liệu của Producer.
Poison Pill Message: Một tin nhắn bị lỗi khiến Consumer crash mỗi khi thử đọc lại (vòng lặp vô tận).
Slow Processing: Logic xử lý trong Consumer quá nặng làm trigger max.poll.interval.ms.
Commit Failed Exception: Consumer mất quá nhiều thời gian xử lý nên bị Broker coi là "đã chết" và thu hồi partition.
Zombie Consumers: Các consumer cũ vẫn còn giữ connection nhưng không xử lý dữ liệu.
Idle Consumers: Số lượng consumer nhiều hơn số partition (gây lãng phí tài nguyên).
Imbalanced Assignment: Một consumer nhận quá nhiều partition trong khi cái khác nhận quá ít.
Duplicate Processing: Xử lý lặp tin nhắn do consumer crash trước khi kịp commit offset.
Fetch Session Timeout: Lỗi kết nối giữa consumer và broker khi mạng chập chờn.
Too many consumer groups: Quá nhiều group quản lý trên một cluster gây tải cho Coordinator.
2. Vấn đề về Performance & Throughput
High Producer Latency: Độ trễ gửi tin nhắn cao do cấu hình acks=all.
Batch Size Inefficiency: Kích thước batch quá nhỏ gây tốn tài nguyên mạng, quá lớn gây tốn bộ nhớ.
Compression Overhead: CPU của Producer tăng cao khi bật nén (Gzip, Snappy, Zstd).
Disk I/O Bottleneck: Broker không ghi kịp dữ liệu xuống đĩa cứng.
Network Saturation: Băng thông mạng giữa các broker hoặc giữa client-broker bị nghẽn.
Context Switching: Quá nhiều thread hoạt động trên Broker.
Memory Swapping: Hệ điều hành đẩy dữ liệu Kafka từ RAM xuống Disk vì hết bộ nhớ.
Zero-copy failure: Không tận dụng được tính năng gửi dữ liệu trực tiếp từ Disk ra Network do cấu hình SSL/TLS.
High Tail Latency (p99): Các đỉnh nhọn về độ trễ không rõ nguyên nhân.
3. Vấn đề về Kiến trúc & Thiết kế Topic
Skewed Partitions: Một partition chứa quá nhiều dữ liệu so với các partition khác do chọn Key sai.
Too many Partitions: Tổng số partition trên cluster quá lớn gây chậm trễ khi startup/shutdown và lỗi metadata.
Inappropriate Retention: Xóa dữ liệu quá sớm hoặc giữ quá lâu gây tràn đĩa.
Topic Deletion Failure: Lệnh xóa topic bị treo vĩnh viễn.
Auto-create Topics: Topic tự động tạo với cấu hình mặc định sai (ví dụ 1 partition, 1 replica).
Key Design Issues: Quên không đặt Key khiến không đảm bảo được thứ tự tin nhắn.
Naming Convention: Đặt tên topic lộn xộn, khó quản lý sau này.
Replication Factor = 1: Mất một máy chủ là mất dữ liệu vĩnh viễn.
4. Vấn đề về Operational & Infrastructure (Vận hành)
Disk Full: Broker ngừng hoạt động vì hết dung lượng đĩa.
In-Sync Replicas (ISR) Shrink: Danh sách các replica đồng bộ bị thu hẹp, gây rủi ro mất dữ liệu.
Under-Replicated Partitions: Dữ liệu chưa kịp copy sang các máy dự phòng.
Controller Failover: Cần quá nhiều thời gian để bầu chọn Controller mới khi máy cũ chết.
Zookeeper/KRaft Connection Issues: Mất kết nối với hệ thống quản lý metadata.
Dirty Leader Election: Chọn một replica không đủ dữ liệu làm leader, gây mất data.
Broker ID Conflicts: Hai broker khởi động với cùng một ID.
Upgrade Downtime: Lỗi khi nâng cấp version Kafka giữa các node.
Log Compaction Failure: Các tin nhắn cũ không được dọn dẹp dù đã có bản mới.
File Descriptor Exhaustion: Hệ điều hành hết giới hạn mở file (open files limit).
JVM Garbage Collection (GC) Pauses: Broker bị treo tạm thời do Java dọn dẹp bộ nhớ.
5. Vấn đề về Data Integrity & Security
Data Loss: Mất dữ liệu do acks=0 hoặc cấu hình retention quá ngắn.
Unencrypted Traffic: Dữ liệu nhạy cảm truyền qua mạng mà không có SSL.
Authorization Failure: Cấu hình ACL sai khiến ứng dụng không đọc/ghi được dữ liệu.
Certificate Expiration: Chứng chỉ SSL hết hạn khiến toàn bộ kết nối bị ngắt.
Large Message Size: Producer gửi tin nhắn lớn hơn max.message.bytes khiến Broker từ chối.
Schema Incompatibility: Format dữ liệu thay đổi khiến Consumer cũ bị crash (cần Schema Registry).
Log Corruption: Dữ liệu trên đĩa bị hỏng do lỗi phần cứng.
6. Vấn đề về Client & App Logic
Resource Leak: Không đóng Kafka Producer/Consumer khi tắt ứng dụng.
Infinite Retry: Producer retry gửi tin nhắn lỗi mãi mãi gây nghẽn hàng đợi.
Offset Out of Range: Consumer cố đọc một offset đã bị xóa khỏi log.
Thread Safety: Dùng một Consumer instance cho nhiều thread (Kafka Consumer không thread-safe).
Transaction Timeout: Các giao dịch xử lý quá lâu bị hủy bỏ.
Inconsistent Metadata: Client giữ thông tin Broker cũ sau khi Broker đã thay đổi IP.
DNS Resolution: Client không phân giải được hostname của các Broker trong mạng nội bộ.
7. Vấn đề về Môi trường Cloud/Kubernetes
Pod Restart: HPA scale liên tục gây rebalance không ngừng.
Persistent Volume Failures: Disk gắn vào Pod bị lỗi kết nối.
Inter-AZ Traffic Costs: Chi phí truyền dữ liệu giữa các vùng (Availability Zones) quá cao.
Load Balancer Timeouts: LB ngắt kết nối Kafka trước khi Client kịp phản hồi.
Advertising IP/Hostname: Client bên ngoài không kết nối được vì Broker báo địa chỉ IP nội bộ.
CPU Throttling: Pod bị giới hạn CPU khiến xử lý Kafka chậm bất thường.
8. Các vấn đề khác (Advanced)
Clock Skew: Thời gian giữa các máy chủ không đồng bộ gây lỗi timestamp.
Kafka Connect Failures: Các connector bị treo không rõ lý do.
Schema Registry Downtime: Khiến toàn bộ luồng data (Avro/Protobuf) bị ngừng trệ.
MirrorMaker Lag: Dữ liệu đồng bộ giữa 2 cluster (ví dụ DC1 sang DC2) bị chậm.
JMX Monitoring Overload: Thu thập quá nhiều metric gây tải cho Broker.
Tuning OS Parameters: Quên không chỉnh vm.swappiness hay max_map_count.
Connection Storm: Hàng nghìn client cùng lúc kết nối lại khi Broker vừa khởi động xong.
Unstable Quotas: Giới hạn băng thông (quotas) khiến ứng dụng bị chậm đột ngột.
Log Segment Fragmentation: Quá nhiều file log nhỏ làm tốn tài nguyên quản lý.
Leader Imbalance: Một Broker làm Leader cho quá nhiều Partition, các Broker khác thì nhàn rỗi.
9. Vấn đề về Cấu hình Log & Storage (Nâng cao)
Log Cleaner Thread chết: Luồng dọn dẹp log bị crash khiến các Topic có tính năng compact phình to vô hạn.
Segment File Locking: Trên Windows hoặc một số hệ thống file, Kafka không thể xóa các file log cũ do bị process khác lock.
Inconsistent Log Retention: Cấu hình retention ở mức Broker khác với mức Topic gây hiểu lầm về thời điểm dữ liệu bị xóa.
Over-provisioning Storage: Cấp phát quá nhiều đĩa cứng gây lãng phí chi phí Cloud (AWS EBS/GCP PD).
Slow Disk Impact: Một ổ đĩa bị lỗi/chậm trên 1 Broker làm kéo tụt hiệu năng của toàn bộ cụm (vì Leader phải đợi Replica ghi xong).
Index File Corruption: File index (.index) bị hỏng khiến việc tìm kiếm offset cực kỳ chậm hoặc lỗi.
10. Vấn đề về Kafka Connect & Ecosystem
Dead Letter Queue (DLQ) phình to: Quên không monitor DLQ của Kafka Connect khiến nó chiếm hết bộ nhớ hoặc đĩa.
Connect Worker Rebalance: Mỗi khi thêm/bớt một Connector, toàn bộ các Task khác cũng bị dừng để chia lại (tương tự Consumer rebalance).
Source Connector Lag: Connector đọc từ Database (JDBC) không kịp tiến độ thay đổi của DB.
Transformation Overhead: Sử dụng quá nhiều Single Message Transforms (SMTs) làm chậm tốc độ của Kafka Connect.
Rest API Hang: API quản lý Kafka Connect bị treo do quá tải request monitor.
11. Vấn đề về Network & Security (Chuyên sâu)
Wildcard DNS Issues: Client kết nối nhầm Broker do cấu hình DNS wildcard không chính xác.
MTU Mismatch: Kích thước gói tin mạng (MTU) không đồng bộ giữa Client và Broker gây mất gói tin hoặc chậm trễ.
TCP Half-Open Connections: Các kết nối chết không được dọn dẹp làm cạn kiệt bảng file descriptor.
SSL Handshake Overhead: Quá nhiều kết nối ngắn hạn bắt Broker phải thực hiện SSL handshake liên tục, gây tốn CPU.
Incorrect advertised.listeners: Cấu hình sai khiến client nhận được IP mạng nội bộ của Broker thay vì IP public.
12. Vấn đề về Quản trị & Con người (Operations)
Lack of Monitoring/Alerting: Hệ thống chạy nhưng không có cảnh báo khi Consumer Lag tăng vọt.
Accidental Topic Deletion: Admin xóa nhầm Topic quan trọng do không phân quyền chặt chẽ.
Manual Partition Assignment: Cố gắng gán partition thủ công dẫn đến mất cân bằng tải trầm trọng.
Documentation Outdated: Tài liệu về sơ đồ luồng dữ liệu (Data Flow) không khớp với thực tế topic trong cluster.
Version Mismatch (Client/Server): Dùng Client thư viện quá cũ không hỗ trợ các tính năng mới của Broker (như giao dịch hoặc nén).
13. Các lỗi "Góc khuất" (Edge Cases)
Negative Offset: Lỗi hiếm gặp khi offset trả về giá trị âm do lỗi logic hoặc hỏng log.
Producer Buffer Exhaustion: Bộ nhớ đệm của Producer bị đầy khiến ứng dụng bị treo (block) khi gọi hàm send().
JMX Port Conflict: Không thể monitor Broker vì cổng JMX bị trùng hoặc bị firewall chặn.
Leader Not Available: Toàn bộ Replica của một partition đều bị văng khỏi ISR, không ai có thể làm Leader.
Metadata Fetch Timeout: Client không thể lấy được danh sách Broker khi mạng bắt đầu có dấu hiệu chập chờn.
Large Topic Metadata: Topic có hàng nghìn partition khiến gói tin metadata quá lớn, gây lỗi cho một số thư viện client cũ.
Graceful Shutdown Failure: Broker bị tắt cưỡng bức (kill -9) khiến việc khôi phục log khi khởi động lại mất hàng giờ đồng hồ.
Idempotent Producer Error: Lỗi trùng lặp ID khiến Producer không thể tiếp tục gửi tin nhắn nếu không khởi động lại.
Kafka-Zookeeper Out of Sync: Dữ liệu về Topic trên Zookeeper khác với dữ liệu thực tế mà Broker đang có (thường gặp khi xóa topic thủ công).
