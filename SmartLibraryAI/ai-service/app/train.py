import os
from pathlib import Path

import tensorflow as tf
from tensorflow import keras

from .settings import CLASS_NAMES, IMAGE_SIZE, MODEL_NAME, MODEL_PATH


DATASET_DIR = Path(os.getenv("DATASET_DIR", Path(__file__).resolve().parents[1] / "dataset"))
TRAIN_DIR = DATASET_DIR / "train"
VALIDATION_DIR = DATASET_DIR / "validation"
BATCH_SIZE = int(os.getenv("BATCH_SIZE", "32"))
EPOCHS = int(os.getenv("EPOCHS", "12"))


def load_split(directory: Path, shuffle: bool):
    if not directory.is_dir():
        raise FileNotFoundError(f"Dataset split not found: {directory}")
    return keras.utils.image_dataset_from_directory(
        directory,
        class_names=list(CLASS_NAMES),
        image_size=IMAGE_SIZE,
        batch_size=BATCH_SIZE,
        shuffle=shuffle,
        seed=42,
    )


def build_model():
    inputs = keras.Input(shape=(*IMAGE_SIZE, 3))
    augmented = keras.Sequential(
        [
            keras.layers.RandomRotation(0.03),
            keras.layers.RandomZoom(0.08),
        ],
        name="cover_augmentation",
    )(inputs)
    scaled = keras.layers.Rescaling(1 / 127.5, offset=-1)(augmented)

    base_model = keras.applications.MobileNetV2(
        input_shape=(*IMAGE_SIZE, 3),
        include_top=False,
        weights="imagenet",
    )
    base_model.trainable = False
    features = base_model(scaled, training=False)
    features = keras.layers.GlobalAveragePooling2D()(features)
    features = keras.layers.Dropout(0.25)(features)
    outputs = keras.layers.Dense(len(CLASS_NAMES), activation="softmax")(features)

    model = keras.Model(inputs, outputs, name=MODEL_NAME)
    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=1e-3),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )
    return model


def main():
    train_dataset = load_split(TRAIN_DIR, shuffle=True).prefetch(tf.data.AUTOTUNE)
    validation_dataset = load_split(VALIDATION_DIR, shuffle=False).prefetch(tf.data.AUTOTUNE)
    model = build_model()
    model.fit(
        train_dataset,
        validation_data=validation_dataset,
        epochs=EPOCHS,
        callbacks=[
            keras.callbacks.EarlyStopping(
                monitor="val_loss",
                patience=3,
                restore_best_weights=True,
            )
        ],
    )
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    model.save(MODEL_PATH)
    print(f"Saved trained model to {MODEL_PATH}")
    print(f"Class order: {', '.join(CLASS_NAMES)}")
    print("Use app.evaluate to measure performance on the separate test split.")


if __name__ == "__main__":
    main()
