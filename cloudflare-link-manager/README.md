# Cloudflare Link Manager

Mini project Cloudflare Pages gồm giao diện tĩnh HTML/CSS/JS, Pages Functions và
D1 binding `env.DB`.

## Cây thư mục

```text
cloudflare-link-manager/
├── functions/
│   ├── _shared/
│   │   ├── auth.js
│   │   ├── http.js
│   │   └── links.js
│   ├── api/
│   │   ├── auth/
│   │   │   ├── login.js
│   │   │   ├── logout.js
│   │   │   ├── me.js
│   │   │   └── register.js
│   │   └── links/
│   │       ├── index.js
│   │       ├── [id].js
│   │       └── [id]/
│   │           └── stats.js
│   └── s/
│       └── [code].js
├── public/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── schema.sql
└── wrangler.toml
```

Frontend thuần HTML/CSS/JS có giao diện sáng/tối, form rút gọn, đăng nhập/đăng ký,
bảng quản lý link và thống kê. Tạo QR ngay trong trình duyệt bằng QRCode.js tải
từ CDN; liên kết không được gửi sang dịch vụ QR bên ngoài.

## API

| Method | Path | Mô tả |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Tạo tài khoản; body: `username`, `email`, `password` |
| `POST` | `/api/auth/login` | Đăng nhập; body: `identifier` (username/email), `password` |
| `POST` | `/api/auth/logout` | Xóa cookie phiên trên trình duyệt |
| `GET` | `/api/auth/me` | Khôi phục tài khoản từ cookie phiên |
| `GET` | `/api/links` | Liệt kê link của tài khoản |
| `POST` | `/api/links` | Tạo link; body: `original_url`, tùy chọn `custom_alias`, `title`, `expires_at` |
| `PATCH` | `/api/links/:id` | Bật/tắt; body: `{ "is_active": false }` |
| `DELETE` | `/api/links/:id` | Xóa link (click log được xóa dây chuyền) |
| `GET` | `/api/links/:id/stats?days=30` | Thống kê theo ngày, thiết bị và quốc gia |
| `GET` | `/s/:code` | Ghi nhận click rồi chuyển hướng HTTP 302 |

API trả lỗi JSON theo dạng
`{ "error": { "code": "…", "message": "…" } }`. Các API quản lý yêu cầu phiên
đăng nhập; link và click log luôn được kiểm tra theo chủ sở hữu.

## Cấu hình và chạy thử

Yêu cầu Node.js/npm và tài khoản Cloudflare. Chạy lệnh từ thư mục này:

1. Tạo D1 database:

   ```sh
   npx wrangler d1 create link-manager-db
   ```

   Chép `database_id` được trả về vào `wrangler.toml`.

2. Tạo bí mật phiên cục bộ trong `.dev.vars` (file đã được ignore):

   ```text
   SESSION_SECRET="<chuỗi ngẫu nhiên tối thiểu 32 byte>"
   ```

   Tạo giá trị ngẫu nhiên bằng Node.js:

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
   ```

   Khi triển khai, đặt secret cho Pages project:

   ```sh
   npx wrangler pages secret put SESSION_SECRET --project-name=cloudflare-link-manager
   ```

3. Khởi tạo schema D1 local và chạy Pages:

   ```sh
   npx wrangler d1 execute link-manager-db --local --file=./schema.sql
   npx wrangler pages dev ./public
   ```

4. Gửi thử request trong PowerShell (hoặc dùng Postman/REST Client):

   ```powershell
   curl.exe -i http://localhost:8788/api/auth/register `
     -H "Content-Type: application/json" `
     -d '{"username":"alice","email":"alice@example.com","password":"a-long-test-password"}'
   ```

   Cookie phiên được đặt `HttpOnly`, `SameSite=Lax`, và `Secure` trên HTTPS.
   Đăng xuất xóa cookie phía trình duyệt; vì schema hiện chỉ có ba bảng nên
   token đã bị sao chép vẫn dùng được đến khi hết hạn (7 ngày).

5. Khi triển khai, áp dụng schema lên D1 từ xa:

   ```sh
   npx wrangler d1 execute link-manager-db --remote --file=./schema.sql
   ```

## Push GitHub và triển khai Pages

1. Push thư mục `cloudflare-link-manager/` lên GitHub.
2. Trong Cloudflare Dashboard, tạo D1 database tại **Workers & Pages** >
   **D1 SQL database**, rồi chạy nội dung `schema.sql` trong Console của database.
3. Chép database ID vào `database_id` trong `wrangler.toml`, giữ binding name
   chính xác là `DB`, rồi commit/push thay đổi. Làm việc này trước khi kết nối
   GitHub để tránh lần deploy đầu dùng ID mẫu chưa hợp lệ.
4. Mở **Workers & Pages** > **Create application** > **Pages** > **Connect to
   Git**; cài/ủy quyền Cloudflare GitHub App nếu được yêu cầu và chọn repository.
5. Vì đây là monorepo, đặt **Root directory** là `cloudflare-link-manager`.
   Chọn framework **None**, để trống Build command (nếu giao diện bắt buộc, dùng
   `exit 0`), đặt Build output directory là `public`, và dùng Build System V2
   hoặc mới hơn.
6. Trong project **Settings** > **Variables and Secrets**, thêm secret
   `SESSION_SECRET` (chuỗi ngẫu nhiên tối thiểu 32 byte) cho Production; đặt
   riêng secret cho Preview nếu bật preview deployments. Lưu và redeploy.
7. `wrangler.toml` là nguồn cấu hình Pages và binding D1 của dự án; không thêm
   một binding trùng tên khác trong Dashboard. Nếu muốn chuyển hẳn binding sang
   Dashboard, cần đổi cấu hình Wrangler trước để hai nguồn không xung đột.
8. Chọn production branch tại **Settings** > **Builds** > **Branch control**.
   Sau deployment, kiểm tra URL Pages: đăng ký/đăng nhập, tạo link, mở `/s/:code`
   và xác nhận thống kê tăng. Có thể thêm custom domain sau khi kiểm thử.

Mật khẩu được dẫn xuất bằng PBKDF2-HMAC-SHA-256 qua Web Crypto với salt ngẫu
nhiên riêng cho từng tài khoản; không dùng SHA-256 thuần để lưu mật khẩu.
Trước khi public production, nên cấu hình rate limit cho endpoint đăng nhập.
