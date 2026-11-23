# SMARTLIBRARY AI

SMARTLIBRARY AI là hệ thống quản lý thư viện được xây dựng theo hướng tách biệt
giao diện, API, dữ liệu và dịch vụ AI. Frontend dùng React + Vite; backend chạy
trên Cloudflare Workers và truy cập dữ liệu qua Cloudflare D1.

## Cấu trúc dự án

```text
SmartLibraryAI/
├── frontend/                 # Giao diện React + Vite
├── worker/                   # REST API trên Cloudflare Workers
├── database/migrations/      # Migration D1
├── ai-service/app/           # Dự kiến: Python + FastAPI + TensorFlow/Keras
└── docs/                     # Kế hoạch và kiến trúc
```

## Trạng thái hiện tại

- Đăng nhập/đăng ký và CRUD sách, độc giả gọi API Worker; các thay đổi nghiệp
  vụ được lưu trong D1 local, không dùng mock data cho hai màn quản lý này.
- Tài khoản đăng ký công khai có vai trò Reader. Phân quyền được xác minh ở
  Worker; chỉ quản trị viên được cấp quyền Admin/Librarian.
- Trang thống kê vẫn có một số biểu đồ minh họa, chưa kết nối API thống kê.
- Chưa tạo database D1 Cloud, chưa triển khai Worker/Pages và chưa tạo tài
  nguyên Cloud trả phí.

## Chạy ứng dụng local

Cần Node.js và npm. Mở hai terminal tại thư mục dự án.

**Terminal 1 — Backend**, tại `worker`:

```bash
npm install
npm run db:local:migrate
npm run dev
```

Worker chạy tại `http://127.0.0.1:8787`. Xác nhận binding D1 local bằng cách
mở `http://127.0.0.1:8787/health/db`.

**Terminal 2 — Frontend**, tại `frontend`:

```bash
npm install
npm run dev
```

Mở URL Vite hiển thị trong terminal (thường là `http://localhost:5173`). Mặc
định frontend gọi Worker tại `http://127.0.0.1:8787`. Nếu Worker chạy ở URL
khác, sao chép `.env.example` thành `.env.local`, cập nhật
`VITE_API_BASE_URL`, rồi khởi động lại Vite.

Đăng ký độc giả từ trang đăng ký để tạo tài khoản Reader lưu trong D1 local.
Để thử giao diện nhân viên trong môi trường local, sau khi đăng ký tài khoản,
chạy lệnh sau từ `worker` và thay email bằng email vừa đăng ký:

```bash
npx wrangler d1 execute DB --local --command "UPDATE users SET role = 'Admin' WHERE email = 'admin@example.test'"
```

Chỉ dùng lệnh này cho D1 local. Không cấp quyền bằng cách gửi role từ frontend
và không chạy lệnh `--remote` trừ khi chủ động cấu hình Cloud.

## Kiểm tra

```bash
# frontend
npm run build

# worker
npm run check
```

Xem [hướng dẫn Worker](worker/README.md) để biết API, migration và cách tự tạo
D1 Cloud; các bước Cloud chỉ là hướng dẫn, chưa được thực hiện.

Tài liệu khác: [kế hoạch dự án](docs/project-plan.md) và
[kiến trúc hệ thống](docs/architecture.md).
