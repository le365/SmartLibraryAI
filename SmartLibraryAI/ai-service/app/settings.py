import os
from pathlib import Path


CLASS_NAMES = (
    "Công nghệ thông tin",
    "Toán học",
    "Khoa học",
    "Ngoại ngữ",
    "Kinh tế",
    "Văn học",
)
IMAGE_SIZE = (224, 224)
MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_IMAGE_PIXELS = 25_000_000
MODEL_NAME = "book-cover-mobilenetv2"
MODEL_PATH = Path(
    os.getenv(
        "MODEL_PATH",
        str(Path(__file__).resolve().parents[1] / "models" / f"{MODEL_NAME}.keras"),
    )
)
