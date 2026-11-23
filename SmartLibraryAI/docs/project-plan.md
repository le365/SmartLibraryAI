# Kế hoạch dự án SMARTLIBRARY AI

## 1. Mục tiêu

Xây dựng hệ thống quản lý thư viện có thể sử dụng qua trình duyệt, hỗ trợ nhân
viên thư viện quản lý tài nguyên và độc giả, đồng thời ứng dụng Deep Learning
để cải thiện tra cứu và gợi ý tài liệu. Kiến trúc hướng dịch vụ giúp mở rộng
frontend, API, dữ liệu và AI độc lập.

## 2. Đối tượng sử dụng

- **Quản trị viên:** cấu hình thư viện, tài khoản, vai trò và danh mục.
- **Thủ thư:** quản lý đầu sách và bản sao, xử lý mượn/trả, theo dõi quá hạn.
- **Độc giả:** tìm kiếm tài liệu, xem tình trạng bản sao và theo dõi lịch sử
  mượn của chính mình.

## 3. Chức năng dự kiến

### Quản lý thư viện

- Quản lý đầu sách, tác giả, chủ đề, nhà xuất bản và bản sao.
- Quản lý hồ sơ độc giả và phân quyền theo vai trò.
- Tìm kiếm, lọc và xem tình trạng sẵn có của tài liệu.
- Lập phiếu mượn/trả, gia hạn, đặt trước và ghi nhận quá hạn.
- Theo dõi lịch sử giao dịch và báo cáo hoạt động thư viện.
- Quản lý ảnh bìa và tài liệu số trong object storage khi có quyền sử dụng phù
  hợp.

### Tính năng AI dự kiến

- Gợi ý sách dựa trên nội dung, chủ đề và lịch sử tương tác được phép sử dụng.
- Tìm kiếm ngữ nghĩa để hỗ trợ truy vấn bằng ngôn ngữ tự nhiên.
- Phân loại chủ đề hoặc trích xuất metadata từ dữ liệu tài liệu khi phù hợp.
- Phân tích xu hướng mượn để hỗ trợ lập kế hoạch bổ sung tài liệu.

AI chỉ cung cấp kết quả hỗ trợ; các quyết định nghiệp vụ như xác nhận mượn/trả,
quyền truy cập và xử lý vi phạm vẫn do API nghiệp vụ kiểm tra.

## 4. Phạm vi giai đoạn

1. **Khởi tạo:** chốt yêu cầu, vai trò, mô hình dữ liệu và quy tắc nghiệp vụ.
2. **Nền tảng:** thiết lập cấu trúc React/Vite, Worker API, D1 migrations, quy
   trình cấu hình và kiểm thử.
3. **Nghiệp vụ cốt lõi:** tài khoản, danh mục sách, độc giả, mượn/trả và tra
   cứu.
4. **Tệp và báo cáo:** tích hợp R2, quản lý ảnh/tài liệu và báo cáo thư viện.
5. **AI:** xây dựng API AI riêng, đánh giá dữ liệu/mô hình, tích hợp gợi ý và
   tìm kiếm ngữ nghĩa.
6. **Triển khai:** kiểm thử bảo mật, hiệu năng, sao lưu/khôi phục và phát hành
   theo môi trường.

## 5. Yêu cầu phi chức năng

- Kiểm tra xác thực và quyền ở phía API; không tin cậy quyền do frontend gửi lên.
- Bảo vệ dữ liệu cá nhân, hạn chế dữ liệu gửi đến AI và ghi nhận mục đích sử
  dụng.
- Dùng migration có phiên bản để thay đổi schema có thể kiểm soát.
- Có logging, xử lý lỗi nhất quán, kiểm thử tự động và tài liệu vận hành.
- Theo dõi hạn mức, lưu lượng và chi phí trước khi bật tài nguyên Cloud.

## 6. Ngoài phạm vi hiện tại

Chưa triển khai mô hình Deep Learning. Chat và phân loại chỉ hoạt động khi một
AI service thật được cấu hình. Chưa tạo database D1 từ xa, bucket R2, Worker
production hay tài nguyên Cloud; các bước tạo tài nguyên được hướng dẫn nhưng
cần người dùng chủ động thực hiện.

## 7. Tiến độ hiện tại

- Frontend React/Vite đã kết nối Worker cho danh mục sách và nghiệp vụ mượn/trả.
- Worker REST API đã có xác thực, phân quyền, CRUD sách/độc giả, mượn/trả,
  thống kê và tích hợp Chat/AI qua service cấu hình.
- D1 local dùng các migration có phiên bản; dữ liệu sách/danh mục, tài khoản, chat và kết
  quả phân loại được đọc/ghi qua binding `env.DB`.
- Reader gửi yêu cầu mượn từng đầu sách; Admin/Librarian duyệt hoặc từ chối.
  Duyệt và trả sách cập nhật tồn kho có điều kiện trong D1 batch; hạn trả được
  lưu và lượt quá hạn tự xác định từ ngày hiện tại.
- Ảnh bìa được tải lên R2 qua Worker; D1 chỉ lưu object key và metadata.
  Binding local dùng R2 simulator; bucket Cloud cần được người vận hành tạo
  và cấu hình riêng.
- Xem [hướng dẫn Worker](../worker/README.md) để chạy local hoặc cấu hình D1
  trên Cloudflare Dashboard.
