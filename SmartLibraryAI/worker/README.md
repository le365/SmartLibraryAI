# SMARTLIBRARY AI Worker API

REST API chạy trên Cloudflare Workers, dùng Hono, D1 (`env.DB`) và Web Crypto
API. Covers dùng binding R2 `env.BOOK_COVERS`. Dữ liệu trong các bước chạy
local không kết nối đến bucket Cloud; chưa có tài nguyên Cloud nào được tạo.

## Yêu cầu

- Node.js phiên bản LTS hiện hành và npm.
- Wrangler được cài cùng project qua `npm install`.

## Chạy local

Từ thư mục `worker`:

```bash
npm install
npm run db:local:migrate
npm run dev
```

Mặc định Worker chạy ở `http://localhost:8787`. Kiểm tra:

```bash
curl http://localhost:8787/health
curl http://localhost:8787/api/books
```

Route API dùng cookie session và cần đăng nhập trước, ngoại trừ `/health`,
`/health/db` và
`POST /api/auth/register`, `POST /api/auth/login`. Đăng ký Reader thử nghiệm:

```bash
curl -i -c cookies.txt -H "Content-Type: application/json" \
  -d "{\"name\":\"Nguyen Van A\",\"email\":\"reader@example.test\",\"password\":\"DemoPassword!123\"}" \
  http://localhost:8787/api/auth/register
```

Gửi cookie nhận được trong `cookies.txt` ở các request cần đăng nhập. Đăng ký
chỉ tạo vai trò Reader. Không có API công khai để tự nâng quyền; Admin và
Librarian cần được tạo bằng quy trình quản trị an toàn ngoài API đăng ký.
Để thử giao diện nhân viên trên D1 local, sau khi đăng ký tài khoản, chỉ định
quyền local bằng lệnh sau (thay email bằng email đã đăng ký):

```bash
npx wrangler d1 execute DB --local --command "UPDATE users SET role = 'Admin' WHERE email = 'admin@example.test'"
```

Không dùng lệnh này với `--remote` để cấp quyền trên môi trường thật.

> Khi dùng PowerShell, có thể gọi API bằng `Invoke-RestMethod` hoặc
> `Invoke-WebRequest` thay cho cú pháp `curl` của shell Unix.

## API hiện có

| Nhóm | Endpoint | Quyền |
| --- | --- | --- |
| Authentication | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | Đăng ký public; các endpoint khác dùng session |
| Categories | `GET /api/categories`, `POST /api/categories` | Đã đăng nhập; tạo danh mục cần Admin/Librarian |
| Books | `GET /api/books`, `GET /api/books/:id` | Đã đăng nhập |
| Books | `POST/PATCH /api/books`, `DELETE /api/books/:id` (lưu trữ mềm) | Admin/Librarian để tạo/sửa; Admin để lưu trữ |
| Book covers | `GET /api/books/:id/cover` | Công khai qua Worker; bucket R2 vẫn private |
| Book covers | `POST/DELETE /api/books/:id/cover` | Admin/Librarian |
| Readers | `POST /api/readers`, `GET /api/readers`, `GET /api/readers/me`, `GET /api/readers/:id` | Tạo/xem danh sách cần Admin/Librarian; Reader chỉ xem hồ sơ của mình |
| Readers | `PATCH /api/readers/:id`, `DELETE /api/readers/:id` (khóa hồ sơ) | Admin/Librarian sửa; Admin khóa |
| Borrowing | `GET /api/borrowings`, `GET /api/borrowings/:id` | Reader chỉ xem lịch sử của mình; nhân viên xem toàn bộ |
| Borrow request | `GET/POST /api/borrowings/requests` | Reader chỉ xem/gửi yêu cầu của mình; Admin/Librarian xem danh sách |
| Borrow request | `POST /api/borrowings/requests/:id/review` | Admin/Librarian duyệt hoặc từ chối; duyệt sẽ tạo phiếu mượn và trừ tồn kho trong D1 batch |
| Borrowing | `POST /api/borrowings` | Admin/Librarian tạo phiếu trực tiếp; Reader phải gửi yêu cầu mượn |
| Returns | `GET /api/returns`, `POST /api/returns/:borrowingId` | Admin/Librarian |
| Statistics | `GET /api/statistics/overview`, `GET /api/statistics/borrowings?days=30`, `GET /api/statistics/categories` | Reader xem số liệu cá nhân; nhân viên xem tổng hợp |
| Chat | `POST /api/chat`, `GET /api/chat/:conversationId` | Đã đăng nhập, cần AI service; lịch sử được lưu theo chủ sở hữu |
| AI classification | `POST /api/ai/classify-cover`, `GET /api/ai/classifications` | Admin/Librarian; ảnh gửi tới AI service và kết quả thật lưu trong D1 |
| AI review | `PATCH /api/ai/classifications/:id/review` | Admin/Librarian xác nhận/sửa nhãn; nếu gắn với sách, danh mục sách cũng được cập nhật |

`POST /api/ai/classify-cover` nhận `multipart/form-data` với field `file` (JPEG,
PNG hoặc WebP, tối đa 5 MiB), và tùy chọn `bookId`; có thể bỏ ảnh khi sách đã có
cover trong R2. Nếu không gắn sách, cần gửi thêm field `title`. JSON thành công
được bọc trong `{ "data": ... }`; lỗi có dạng
`{ "error": { "code", "message", "requestId" } }`. Danh sách hỗ trợ `limit`
(1-100) và `offset`.

## D1 local và kiểm tra cấu hình

Migration đặt ở `../database/migrations`:

- `0001_initial_schema.sql`: users, readers, books và nghiệp vụ mượn/trả ban đầu.
- `0002_relational_catalog_and_activity.sql`: chuẩn hóa categories, thêm
  borrow_requests/borrow_details, chat_messages và ai_classifications.
- `0003_book_publisher_and_cover.sql`: bổ sung nhà xuất bản và URL ảnh bìa.
- `0004_remove_unmodified_sample_books.sql`: loại bỏ sách fixture chưa được
  thay đổi và chưa có lịch sử nghiệp vụ; các bản ghi đã sửa hoặc có giao dịch
  được giữ nguyên.
- `0005_borrow_request_indexes.sql`: thêm index cho danh sách yêu cầu và liên
  kết chi tiết yêu cầu.
- `0006_r2_book_covers.sql`: lưu R2 object key, MIME type và kích thước ảnh;
  D1 không lưu nội dung ảnh hay Base64.
- `0007_book_cover_classification_review.sql`: thêm sáu lớp phân loại và trạng
  thái thủ thư xác nhận/chỉnh sửa nhãn AI.

Độc giả chỉ gửi yêu cầu khi sách còn ít nhất một bản. Duyệt yêu cầu dùng D1
batch với cập nhật có điều kiện để tránh vượt tồn kho; nếu bản cuối đã được cấp
cho giao dịch khác thì yêu cầu vẫn chờ duyệt và API trả lỗi xung đột. Hạn trả
mặc định là 14 ngày (có thể cấu hình 1-90 ngày khi duyệt). Trạng thái quá hạn
được tính tự động từ `due_at` và thời điểm hiện tại; lịch sử của độc giả chỉ
trả về các giao dịch thuộc hồ sơ của họ.

Books và readers được đọc/ghi trực tiếp qua D1, không có mock fallback. Danh
mục sách là khóa ngoại `books.category_id -> categories.id`; API vẫn nhận tên
danh mục qua `category` hoặc ID qua `categoryId`. Chat và phân loại chỉ lưu kết
quả AI thật sau khi gọi service thành công.

## Ảnh bìa sách với R2

Worker nhận `multipart/form-data` ở `POST /api/books/:id/cover`, field tên
`file`. Chỉ Admin/Librarian được tải lên hoặc xóa. Ảnh phải là JPEG, PNG hoặc
WebP hợp lệ (kiểm tra MIME và chữ ký file), tối đa 5 MiB. Worker lưu bytes
trực tiếp vào R2; D1 chỉ lưu object key, MIME type và kích thước. Cover được
đọc qua `GET /api/books/:id/cover`; bucket không cần bật public access hoặc
`r2.dev`. `DELETE /api/books/:id/cover` gỡ metadata trong D1 và xóa object.

Local development dùng R2 simulator của Wrangler, lưu state trong thư mục
`.wrangler/state`; lệnh `npm run dev` không truy cập bucket Cloud. Để tạo bucket
production, thực hiện thủ công một trong các cách sau:

1. Cloudflare Dashboard: mở **R2 Object Storage > Create bucket**, đặt tên
   `smartlibrary-covers-production` (hoặc tên khác).
2. Hoặc từ thư mục `worker`, tự chạy
   `npx wrangler r2 bucket create smartlibrary-covers-production`.

Không chạy lệnh tạo bucket nếu chưa muốn tạo tài nguyên Cloud. Sau khi tạo,
`worker/wrangler.jsonc` đã khai báo binding `BOOK_COVERS` cho môi trường
production với bucket name tương ứng. Nếu chọn tên khác, sửa
`env.production.r2_buckets[].bucket_name`. Khi cấu hình binding trực tiếp trên
Dashboard, mở **Workers & Pages > Worker > Settings > Bindings > Add > R2
bucket**, đặt **Variable name** là `BOOK_COVERS` và chọn bucket vừa tạo. Binding
không tự kế thừa giữa các Wrangler environments, nên giữ khai báo riêng trong
`env.production`. Không bật `remote: true` cho binding local nếu muốn chỉ dùng
R2 simulator. Chi tiết xem [Cloudflare R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-usage/),
[R2 local development](https://developers.cloudflare.com/r2/local-development/)
và [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/).

Lệnh local chỉ tác động SQLite trong `.wrangler/state` của project:

```bash
npm run db:local:migrate
npm run dev
```

Sau đó gọi `http://localhost:8787/health/db`; response thành công xác nhận
binding D1 local có thể chạy query. Đây không phải database trên Cloudflare.

## Tạo D1 trên Cloudflare Dashboard (chưa thực hiện)

Các bước này tạo database từ xa trong tài khoản Cloudflare và do người dùng
thực hiện. D1 có hạn mức theo gói/tài khoản; kiểm tra **Workers & Pages >
Billing** trước khi tạo. Chưa có tài nguyên Cloud nào được tạo trong phiên này.

1. Mở [D1 SQL database trong Cloudflare Dashboard](https://dash.cloudflare.com/?to=/:account/workers/d1).
2. Chọn **Create Database**, đặt tên `smartlibrary-production`, chọn location
   hint nếu cần, rồi xác nhận. Đây là thao tác tạo database từ xa.
3. Mở database vừa tạo và sao chép **Database ID**.
4. Trong `worker/wrangler.jsonc`, chỉ thay `database_id` và
   `database_name` bên trong `env.production.d1_databases` bằng thông tin vừa
   tạo. Giữ nguyên binding name `DB`; code Worker đọc nó qua `env.DB`. UUID
   database ID là định danh, không phải API token/mật khẩu.
5. Đặt `CORS_ORIGINS` trong `env.production.vars` thành origin Pages chính xác,
   ví dụ `https://<ten-du-an>.pages.dev`; không dùng `*` với cookie session.
6. Từ thư mục `worker`, áp dụng migration từ xa bằng
   `npm run db:remote:migrate`. Không thêm `--local`; lệnh này ghi schema lên
   database Cloud vừa tạo.
7. Xác nhận không còn migration chờ áp dụng:

   ```bash
   npx wrangler d1 migrations list DB --remote --env production
   ```

8. Sau khi triển khai Worker production, gọi
   `https://<worker-domain>/health/db`. Kết quả `{ "data": { "status": "ok",
   "database": "connected" } }` xác nhận binding/runtime query hoạt động.

Nếu Worker đã được tạo từ Dashboard, có thể vào **Workers & Pages > Worker >
Settings > Bindings > Add > D1 database**, đặt **Variable name** là `DB` và
chọn database. Đồng bộ cùng database ID trong `wrangler.jsonc` để không lệch
cấu hình giữa Dashboard và mã nguồn.

Hai binding trong `wrangler.jsonc` đang dùng ID placeholder khác nhau cho local
và production; điều này ngăn cấu hình mẫu vô tình trỏ vào database thật. Không
deploy production trước khi thay placeholder và kiểm tra origin. `npm run check`
chỉ thực hiện dry-run, không deploy.

## Cấu hình AI local

AI Service dùng Python 3.12, FastAPI và TensorFlow/Keras; xem
[`ai-service/README.md`](../ai-service/README.md) để cài dependencies, chuẩn bị
dataset, huấn luyện MobileNetV2 và đánh giá model. Repository chưa có dataset
hoặc model đã huấn luyện. Khi chưa có model, API trả `503 MODEL_NOT_TRAINED`,
không tạo kết quả giả và không ghi bản phân loại vào D1.

Khởi động AI Service ở terminal riêng trong `ai-service`, sau đó đặt URL và
cùng service token trong `worker/.dev.vars` (file này không commit):

```dotenv
AI_SERVICE_URL=http://127.0.0.1:8000/
AI_SERVICE_TOKEN=local-development-token
```

AI Service local cũng cần chạy với `AI_SERVICE_TOKEN` có cùng giá trị. Khởi
động lại Wrangler sau khi sửa `.dev.vars`. Worker chỉ cho phép HTTP trong
development; môi trường triển khai phải dùng HTTPS và đặt token bằng secret
manager, không lưu trong Git. AI API nhận ảnh tại `POST /predict`; Worker
chuyển tiếp ảnh tới service, kiểm tra response rồi lưu top 3 và nhãn dự đoán
trong D1. Thủ thư có thể xác nhận hoặc sửa nhãn qua giao diện AI; với bản ghi
đã gắn sách, nhãn được duyệt sẽ cập nhật danh mục sách.

## AI service production

Nếu dùng AI, khai báo `AI_SERVICE_URL` và token bằng Wrangler secret/biến môi
trường phù hợp sau khi có service HTTPS. Không ghi token vào `wrangler.jsonc`,
`.dev.vars` đã commit, hoặc GitHub.
