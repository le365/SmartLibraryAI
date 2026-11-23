import os
from pathlib import Path

import numpy as np
import tensorflow as tf
from tensorflow import keras

from .model import load_model
from .settings import CLASS_NAMES, IMAGE_SIZE


TEST_DIR = Path(os.getenv("DATASET_DIR", Path(__file__).resolve().parents[1] / "dataset")) / "test"
BATCH_SIZE = int(os.getenv("BATCH_SIZE", "32"))


def main():
    if not TEST_DIR.is_dir():
        raise FileNotFoundError(f"Test split not found: {TEST_DIR}")
    dataset = keras.utils.image_dataset_from_directory(
        TEST_DIR,
        class_names=list(CLASS_NAMES),
        image_size=IMAGE_SIZE,
        batch_size=BATCH_SIZE,
        shuffle=False,
    ).prefetch(tf.data.AUTOTUNE)
    model = load_model()
    matrix = np.zeros((len(CLASS_NAMES), len(CLASS_NAMES)), dtype=np.int64)

    for images, labels in dataset:
        probabilities = model.predict(images, verbose=0)
        predicted = np.argmax(probabilities, axis=1)
        actual = labels.numpy()
        np.add.at(matrix, (actual, predicted), 1)

    total = int(matrix.sum())
    if total == 0:
        raise ValueError("The test split contains no images.")
    per_class = {}
    for index, name in enumerate(CLASS_NAMES):
        true_positive = int(matrix[index, index])
        precision_denominator = int(matrix[:, index].sum())
        recall_denominator = int(matrix[index, :].sum())
        per_class[name] = {
            "precision": true_positive / precision_denominator if precision_denominator else 0.0,
            "recall": true_positive / recall_denominator if recall_denominator else 0.0,
        }

    print(f"Test images: {total}")
    print(f"Accuracy: {np.trace(matrix) / total:.4f}")
    print(f"Macro precision: {np.mean([item['precision'] for item in per_class.values()]):.4f}")
    print(f"Macro recall: {np.mean([item['recall'] for item in per_class.values()]):.4f}")
    print("Per-class precision/recall:")
    for name, metrics in per_class.items():
        print(f"  {name}: precision={metrics['precision']:.4f}, recall={metrics['recall']:.4f}")
    print("Confusion matrix (rows=actual, columns=predicted):")
    print(matrix)


if __name__ == "__main__":
    main()
