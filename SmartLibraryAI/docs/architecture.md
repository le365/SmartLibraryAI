# Kiến trúc Cloud SMARTLIBRARY AI

## 1. Tổng quan

Hệ thống chia thành frontend, API nghiệp vụ, dữ liệu và dịch vụ AI. Trình duyệt
chỉ gọi API công khai của Worker; không kết nối trực tiếp tới D1, R2 hoặc AI
service.

```text
Độc giả / Thủ thư
       |
       v
React + Vite (static build)
       |
       v
Cloudflare Pages
       |
       | HTTPS API
       v
Cloudflare Workers
    |             \
    |              \ HTTPS, xác thực dịch vụ
    v               v
Cloudflare D1     AI service riêng
Cloudflare R2     Python + FastAPI
                  TensorFlow / Keras
```

## 2. Thành phần

### Frontend: React + Vite

- React xây dựng giao diện độc giả, thủ thư và quản trị viên.
- Vite phát triển ứng dụng và tạo static build để phân phối.
- Gọi Cloudflare Workers qua HTTPS; không chứa secret, quyền truy cập database
  hoặc khóa của AI service.
- Hiển thị kết quả AI như gợi ý; quyền nghiệp vụ vẫn do Worker quyết định.

### Cloudflare Pages

- Phân phối static build của frontend.
- Tích hợp GitHub để tự động tạo deployment production và preview.
- Không xử lý truy vấn D1 trực tiếp; API được gửi tới Workers.

### Cloudflare Workers

- Là lớp API/BFF giữa frontend, D1, R2 và AI service.
- Chịu trách nhiệm xác thực, phân quyền, kiểm tra đầu vào, nghiệp vụ mượn/trả,
  tra cứu và chuẩn hóa lỗi.
- Backend hiện dùng Hono, JavaScript ES modules và các Web API tương thích
  Workers; session opaque token được lưu dạng hash trong D1, mật khẩu được băm
  PBKDF2-HMAC-SHA-256 bằng Web Crypto.
- API đã có nhóm Authentication, Books, Readers, Borrowings, Returns,
  Statistics, Chat và AI Classification. Chat/AI chuyển tiếp tới AI service đã
  cấu hình; nếu chưa cấu hình, trả lỗi 503 thay vì kết quả giả.
- Dùng binding để truy cập D1 và R2; không gửi thông tin binding hoặc secret
  xuống frontend.
- Gọi AI service qua HTTPS với xác thực dịch vụ, giới hạn thời gian và xử lý
  lỗi. Khi AI không sẵn sàng, nghiệp vụ thư viện cốt lõi cần tiếp tục hoạt động
  mà không phụ thuộc vào kết quả AI.

### Cloudflare D1

- Database quan hệ cho tài khoản, vai trò, độc giả, metadata sách, bản sao,
  phiếu mượn/trả, đặt trước và lịch sử giao dịch.
- Schema hiện có `users`, `readers`, `books`, `categories`, `borrowings`,
  `returns`, `borrow_requests`, `borrow_details`, `chat_messages` và
  `ai_classifications`; sách tham chiếu danh mục qua khóa ngoại `category_id`.
- Thay đổi schema qua migration có phiên bản trong `database/migrations/`.
- Worker là lớp duy nhất truy vấn D1; không cấp quyền database trực tiếp cho
  trình duyệt hoặc AI service.

### Cloudflare R2

- Object storage ảnh bìa qua binding `BOOK_COVERS`; binding local dùng R2
  simulator của Wrangler, production dùng bucket được cấu hình riêng.
- Worker chỉ cho Admin/Librarian tải lên hoặc xóa cover; kiểm tra JPEG/PNG/WebP
  theo chữ ký file và giới hạn 5 MiB. Đường đọc cover đi qua Worker, bucket
  không cần public access.
- D1 chỉ giữ object key, MIME type và kích thước; bytes ảnh không lưu trong D1.
- Không tạo bucket Cloud tự động; người vận hành tạo bucket và cấu hình binding
  theo [hướng dẫn Worker](../worker/README.md).

### AI service riêng: Python + FastAPI + TensorFlow/Keras

- Chạy như dịch vụ độc lập, không chạy TensorFlow trong Cloudflare Workers.
- `POST /predict` nhận ảnh bìa và trả nhãn, độ tin cậy, top 3; MobileNetV2
  transfer learning được huấn luyện bằng dataset có sáu lớp do thư viện chuẩn
  bị.
- Chưa có dataset/model huấn luyện trong repository. Khi thiếu model, API trả
  `503 MODEL_NOT_TRAINED`; không tạo dự đoán giả.
- Không cho AI service truy cập trực tiếp D1/R2. Worker chỉ gửi dữ liệu tối
  thiểu cần thiết, loại bỏ thông tin nhận dạng cá nhân không cần thiết, và
  kiểm tra phản hồi trước khi ghi kết quả vào D1.
- Thủ thư có thể xác nhận hoặc chỉnh sửa nhãn. Worker lưu trạng thái duyệt và
  cập nhật danh mục sách liên kết trong D1.
- Cần chọn nơi triển khai AI service theo yêu cầu runtime, GPU/CPU, độ trễ,
  bảo mật và ngân sách ở giai đoạn triển khai; tài liệu này không tạo hoặc
  chọn tài nguyên Cloud trả phí. Xem [`ai-service/README.md`](../ai-service/README.md)
  để biết các giới hạn free tier và giá tham khảo từ trang chính thức.

## 3. Luồng dữ liệu dự kiến

1. Người dùng thao tác trên React frontend được phân phối bởi Pages.
2. Frontend gửi request HTTPS đến Worker.
3. Worker xác thực người dùng, kiểm tra quyền và dữ liệu đầu vào.
4. Worker đọc/ghi dữ liệu nghiệp vụ trong D1 hoặc thao tác object trong R2.
5. Với tác vụ AI, Worker gửi ảnh tới FastAPI; AI service trả dự đoán, Worker
   kiểm tra và lưu top 3 cùng nhãn dự đoán vào D1.
6. Thủ thư xác nhận hoặc sửa nhãn qua Worker; nếu có sách liên kết, Worker cập
   nhật danh mục của sách trong D1.

## 4. Bảo mật và vận hành

- Dùng HTTPS giữa các thành phần; secrets chỉ lưu trong secret manager của môi
  trường triển khai.
- Phân quyền theo vai trò và kiểm tra quyền sở hữu ở từng API.
- Giới hạn loại/kích thước tệp R2, kiểm tra quyền truy cập và không công khai
  tài liệu riêng tư.
- Tách môi trường development, preview và production; tránh dùng dữ liệu thật
  trong môi trường thử nghiệm.
- Ghi log có kiểm soát, không đưa mật khẩu, token hoặc dữ liệu cá nhân vào log.
- Đo độ trễ và lỗi khi gọi AI; đặt timeout và giới hạn request để tránh phụ
  thuộc không kiểm soát.

## 5. Trạng thái triển khai

Worker API và schema migrations đã được kiểm thử với D1/R2 local. Frontend gọi
Worker cho danh mục sách, nghiệp vụ mượn/trả và hiển thị ảnh cover qua Worker.
Chưa cấu hình hoặc tạo Cloudflare Pages project, database D1 từ xa, bucket R2
hay dịch vụ AI; chưa deploy và chưa tạo tài nguyên Cloud. Xem
[hướng dẫn Worker](../worker/README.md) để chạy local và tự cấu hình D1 Cloud.
