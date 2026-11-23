# SMARTLIBRARY AI Service

Dịch vụ riêng dùng FastAPI và TensorFlow/Keras để phân loại ảnh bìa sách bằng
MobileNetV2 transfer learning. Worker gọi dịch vụ qua HTTP; dịch vụ không truy
cập D1 hoặc R2. Repo không chứa dataset hay model đã huấn luyện. Khi chưa có
model, `POST /predict` trả HTTP 503 với mã `MODEL_NOT_TRAINED`, không tạo dự
đoán thay thế.

## Yêu cầu và chạy API local

TensorFlow hiện yêu cầu Python 3.9–3.12 theo hướng dẫn cài đặt chính thức. Máy
Windows hiện có Python 3.14; hãy cài thêm Python 3.12, hoặc dùng môi trường
Linux/WSL2. API chỉ hoạt động với ảnh sau khi có model đã huấn luyện.

Trong PowerShell, tại thư mục `SmartLibraryAI\ai-service`:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
$env:AI_SERVICE_TOKEN = "local-development-token"
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Kiểm tra tình trạng dịch vụ và model:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
Invoke-RestMethod http://127.0.0.1:8000/health/model
```

`model_ready: false` là trạng thái đúng trước khi huấn luyện. API docs tương tác
nằm tại `http://127.0.0.1:8000/docs`.

## Chuẩn bị dataset

Thu thập ảnh bìa mà thư viện có quyền sử dụng; không tải/sử dụng bộ ảnh có bản
quyền nếu chưa được cấp phép. Gán nhãn thủ công chính xác theo sáu thư mục tên
đúng như sau:

```text
dataset/
  train/
    Công nghệ thông tin/
    Toán học/
    Khoa học/
    Ngoại ngữ/
    Kinh tế/
    Văn học/
  validation/
    Công nghệ thông tin/
    Toán học/
    Khoa học/
    Ngoại ngữ/
    Kinh tế/
    Văn học/
  test/
    Công nghệ thông tin/
    Toán học/
    Khoa học/
    Ngoại ngữ/
    Kinh tế/
    Văn học/
```

Đặt JPEG, PNG hoặc WebP trong từng thư mục. Tách theo **đầu sách/nguồn ảnh**,
không chia ngẫu nhiên các ảnh gần trùng của cùng một cuốn sách sang nhiều
split. Giữ test set độc lập đến bước đánh giá; cân bằng số lượng và đa dạng
ảnh giữa sáu lớp; loại ảnh hỏng, trùng và nhãn không chắc chắn. Dataset chưa
có sẵn; không chạy huấn luyện trước khi có đủ dữ liệu được kiểm tra nhãn.

## Huấn luyện và đánh giá

Từ `ai-service`, với virtual environment đã kích hoạt:

```powershell
python -m app.train
python -m app.evaluate
```

Mặc định mô hình MobileNetV2 dùng ImageNet weights làm feature extractor, thêm
classification head sáu lớp và augmentation nhẹ. Training dùng `dataset/train`
và `dataset/validation`, early stopping và lưu model tại
`models/book-cover-mobilenetv2.keras`. Evaluation chỉ dùng
`dataset/test`, in accuracy, macro precision/recall và confusion matrix. Chỉ
đưa model vào môi trường tích hợp sau khi xem kết quả trên test set và xác nhận
chất lượng nhãn. Kết quả đánh giá là trách nhiệm của người huấn luyện; repo
không khẳng định một accuracy chưa đo.

Có thể đổi vị trí dữ liệu/model bằng `DATASET_DIR` và `MODEL_PATH`. Model phải
có đúng thứ tự sáu lớp khai báo ở `app/settings.py`.

## Thử API

Với model đã huấn luyện:

```powershell
curl.exe -X POST http://127.0.0.1:8000/predict `
  -H "Authorization: Bearer $env:AI_SERVICE_TOKEN" `
  -F "file=@C:\path\to\book-cover.jpg;type=image/jpeg"
```

Response chứa `category`, `confidence` trong khoảng 0–1, `top3` gồm ba nhãn
và `model`. Ảnh tối đa 5 MiB, chấp nhận JPEG/PNG/WebP; service kiểm tra loại
ảnh thật trước khi decode.

## Kết nối Worker

Tạo `worker/.dev.vars` (không commit secrets) và đặt cùng token như AI service:

```dotenv
AI_SERVICE_URL=http://127.0.0.1:8000/
AI_SERVICE_TOKEN=local-development-token
```

Khởi động AI service và Worker trong hai terminal riêng. Giao diện thủ thư gửi
ảnh lên `POST /api/ai/classify-cover`; Worker kiểm tra session/role, gửi ảnh
cho `/predict`, xác thực response rồi ghi kết quả vào D1. Thủ thư có thể xác
nhận nhãn hoặc chọn nhãn khác tại `PATCH /api/ai/classifications/:id/review`.
Nếu model chưa có, Worker trả lỗi `MODEL_NOT_TRAINED` và không lưu kết quả.

## Triển khai và chi phí

Dockerfile đóng gói service cho nền tảng chạy container Python; model phải được
đưa vào image hoặc mount từ kho model riêng khi triển khai. Bắt buộc dùng HTTPS,
đặt `AI_SERVICE_TOKEN` bằng secret manager, giới hạn truy cập network chỉ cho
Worker và đặt giới hạn CPU/RAM/concurrency phù hợp. Không public endpoint không
có xác thực.

Chưa tạo tài khoản, triển khai hoặc tạo tài nguyên trả phí. Tại thời điểm viết
tài liệu, Hugging Face công bố CPU Basic 2 vCPU/16 GB ở mức miễn phí, nhưng
Docker Spaces chạy trên compute yêu cầu gói trả phí; trang giá hiển thị PRO
$9/tháng và các mức GPU tính theo giờ. Google Cloud Run công bố free tier hàng
tháng gồm 240.000 vCPU-giây và 450.000 GiB-giây theo mức giá `us-central1`;
phần vượt mức, lưu trữ model, network egress và khác biệt khu vực có thể bị tính
phí, đồng thời cần cấu hình billing. Các mức giá và điều kiện có thể đổi; hãy
xem lại trang chính thức và dùng calculator theo region trước khi bật billing:

- [Hugging Face Spaces hardware](https://huggingface.co/docs/hub/spaces-overview#hardware-resources)
- [Hugging Face pricing](https://huggingface.co/pricing)
- [Google Cloud Run pricing](https://cloud.google.com/run/pricing)
- [TensorFlow pip installation](https://www.tensorflow.org/install/pip)
