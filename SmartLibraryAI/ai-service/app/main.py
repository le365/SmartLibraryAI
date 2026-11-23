import hmac
import os
from threading import Lock

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from .model import InvalidCoverImageError, ModelNotTrainedError, predict_cover_image
from .settings import CLASS_NAMES, MAX_IMAGE_BYTES, MODEL_NAME, MODEL_PATH


app = FastAPI(
    title="SMARTLIBRARY AI Book Cover Classifier",
    version="0.1.0",
    description="Classifies book cover images with a trained TensorFlow/Keras model.",
)
inference_lock = Lock()


class PredictionItem(BaseModel):
    category: str
    confidence: float = Field(ge=0, le=1)


class PredictionResponse(BaseModel):
    category: str
    confidence: float = Field(ge=0, le=1)
    top3: list[PredictionItem] = Field(min_length=3, max_length=3)
    model: str


async def require_service_token(authorization: str | None = Header(default=None)):
    expected_token = os.getenv("AI_SERVICE_TOKEN")
    if not expected_token:
        raise HTTPException(status_code=503, detail="AI_SERVICE_TOKEN is not configured.")
    prefix = "Bearer "
    if not authorization or not authorization.startswith(prefix):
        raise HTTPException(status_code=401, detail="A valid service token is required.")
    supplied_token = authorization[len(prefix):]
    if not hmac.compare_digest(supplied_token, expected_token):
        raise HTTPException(status_code=401, detail="A valid service token is required.")


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/health/model")
async def model_health():
    return {
        "model_ready": MODEL_PATH.is_file(),
        "model": MODEL_NAME,
        "classes": list(CLASS_NAMES),
    }


@app.post("/predict", response_model=PredictionResponse, dependencies=[Depends(require_service_token)])
async def predict(file: UploadFile = File(...)):
    content_type = (file.content_type or "").split(";", maxsplit=1)[0].strip().lower()
    if content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=415, detail="Only JPEG, PNG, and WebP images are supported.")

    image_bytes = await file.read(MAX_IMAGE_BYTES + 1)
    if not image_bytes:
        raise HTTPException(status_code=400, detail="The uploaded image is empty.")
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Images must be at most 5 MiB.")

    try:
        with inference_lock:
            return await run_in_threadpool(predict_cover_image, image_bytes, content_type)
    except ModelNotTrainedError as error:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "MODEL_NOT_TRAINED",
                "message": "No trained classifier model is installed. Prepare the dataset and run app.train first.",
            },
        ) from error
    except InvalidCoverImageError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
