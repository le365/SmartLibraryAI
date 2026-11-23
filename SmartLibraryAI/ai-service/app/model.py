from functools import lru_cache
from io import BytesIO
import math
import warnings

import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError

from .settings import CLASS_NAMES, IMAGE_SIZE, MAX_IMAGE_PIXELS, MODEL_NAME, MODEL_PATH


class ModelNotTrainedError(Exception):
    pass


class InvalidCoverImageError(ValueError):
    pass


@lru_cache(maxsize=1)
def load_model():
    if not MODEL_PATH.is_file():
        raise ModelNotTrainedError

    import tensorflow as tf

    model = tf.keras.models.load_model(MODEL_PATH)
    output_shape = model.output_shape
    if isinstance(output_shape, list):
        output_shape = output_shape[0]
    if len(output_shape) != 2 or output_shape[-1] != len(CLASS_NAMES):
        raise RuntimeError("The saved model output does not match the six configured classes.")
    return model


def decode_cover_image(image_bytes: bytes, content_type: str) -> np.ndarray:
    accepted_formats = {
        "image/jpeg": "JPEG",
        "image/png": "PNG",
        "image/webp": "WEBP",
    }
    expected_format = accepted_formats.get(content_type.lower())
    if expected_format is None:
        raise InvalidCoverImageError("Only JPEG, PNG, and WebP images are supported.")

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(image_bytes)) as image:
                if image.format != expected_format:
                    raise InvalidCoverImageError("The image content does not match its Content-Type.")
                if image.width * image.height > MAX_IMAGE_PIXELS:
                    raise InvalidCoverImageError("The image dimensions are too large.")
                image.verify()
            with Image.open(BytesIO(image_bytes)) as image:
                image = ImageOps.exif_transpose(image).convert("RGB")
                image = image.resize(IMAGE_SIZE, Image.Resampling.BILINEAR)
                return np.asarray(image, dtype=np.float32)[np.newaxis, ...]
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning) as error:
        raise InvalidCoverImageError("The uploaded file is not a valid supported image.") from error


def predict_cover_image(image_bytes: bytes, content_type: str) -> dict:
    image = decode_cover_image(image_bytes, content_type)
    model = load_model()
    predictions = np.asarray(model.predict(image, verbose=0))
    if predictions.shape != (1, len(CLASS_NAMES)):
        raise RuntimeError("The saved model returned an invalid prediction shape.")

    probabilities = predictions[0]
    if (
        not np.isfinite(probabilities).all()
        or np.any(probabilities < 0)
        or np.any(probabilities > 1)
        or not math.isclose(float(probabilities.sum()), 1.0, rel_tol=1e-3, abs_tol=1e-3)
    ):
        raise RuntimeError("The saved model did not return valid class probabilities.")

    top_indices = np.argsort(probabilities)[::-1][:3]
    top3 = [
        {
            "category": CLASS_NAMES[index],
            "confidence": round(float(probabilities[index]), 6),
        }
        for index in top_indices
    ]
    return {
        "category": top3[0]["category"],
        "confidence": top3[0]["confidence"],
        "top3": top3,
        "model": MODEL_NAME,
    }
