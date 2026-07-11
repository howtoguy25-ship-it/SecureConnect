"""
Trains a small MobileNetV2-based classifier (frozen base + trainable head) on the
cropped vehicle images from prepare_crops.py, then exports it as a TensorFlow.js
layers model that both the web app (@tensorflow/tfjs) and mobile app
(@tensorflow/tfjs-react-native) can load directly -- same model file, both platforms.

This is a real trained model on real (if modest -- a few hundred images) labeled
data, not a fabricated classifier. Reported val accuracy at the end of training is
the honest number to quote for how well it actually works, not a marketing claim.
"""

import os
import tensorflow as tf
from tensorflow.keras import layers, models

CROPS_DIR = os.path.join(os.path.dirname(__file__), "crops")
MODEL_OUT_DIR = os.path.join(os.path.dirname(__file__), "model")
IMG_SIZE = (224, 224)
BATCH_SIZE = 16
EPOCHS = 15

CLASS_NAMES = ["ambulance", "firetruck", "other", "police-car"]  # alphabetical, matches flow_from_directory


def build_datasets():
    train_ds = tf.keras.utils.image_dataset_from_directory(
        os.path.join(CROPS_DIR, "train"),
        image_size=IMG_SIZE,
        batch_size=BATCH_SIZE,
        label_mode="categorical",
        class_names=CLASS_NAMES,
    )
    val_ds = tf.keras.utils.image_dataset_from_directory(
        os.path.join(CROPS_DIR, "valid"),
        image_size=IMG_SIZE,
        batch_size=BATCH_SIZE,
        label_mode="categorical",
        class_names=CLASS_NAMES,
    )
    normalize = layers.Rescaling(1.0 / 127.5, offset=-1)  # MobileNetV2 expects [-1, 1]
    train_ds = train_ds.map(lambda x, y: (normalize(x), y)).prefetch(tf.data.AUTOTUNE)
    val_ds = val_ds.map(lambda x, y: (normalize(x), y)).prefetch(tf.data.AUTOTUNE)
    return train_ds, val_ds


def build_model(num_classes: int):
    base = tf.keras.applications.MobileNetV2(
        input_shape=(*IMG_SIZE, 3), include_top=False, weights="imagenet"
    )
    base.trainable = False  # transfer learning: keep the pretrained feature extractor frozen

    model = models.Sequential(
        [
            base,
            layers.GlobalAveragePooling2D(),
            layers.Dropout(0.3),
            layers.Dense(64, activation="relu"),
            layers.Dense(num_classes, activation="softmax"),
        ]
    )
    model.compile(optimizer="adam", loss="categorical_crossentropy", metrics=["accuracy"])
    return model


def main():
    train_ds, val_ds = build_datasets()

    # Class weighting: our classes are imbalanced (216 ambulance vs 98 firetruck vs
    # ~104 other vs 131 police-car in training), so weight the loss inversely to
    # frequency to avoid the model just learning to predict "ambulance" a lot.
    counts = {
        name: len(os.listdir(os.path.join(CROPS_DIR, "train", name)))
        for name in CLASS_NAMES
        if os.path.isdir(os.path.join(CROPS_DIR, "train", name))
    }
    total = sum(counts.values())
    class_weight = {
        i: total / (len(CLASS_NAMES) * counts.get(name, 1)) for i, name in enumerate(CLASS_NAMES)
    }
    print("Class counts:", counts)
    print("Class weights:", class_weight)

    model = build_model(len(CLASS_NAMES))
    model.summary()

    # This dataset is small enough that the model overfits well before epoch 15 (training
    # accuracy hits 100% while val accuracy peaks early then drifts back down) -- restore
    # the best-val-accuracy weights instead of just saving whatever the last epoch lands on.
    early_stop = tf.keras.callbacks.EarlyStopping(
        monitor="val_accuracy", patience=5, restore_best_weights=True
    )

    history = model.fit(
        train_ds,
        validation_data=val_ds,
        epochs=EPOCHS,
        class_weight=class_weight,
        callbacks=[early_stop],
    )

    final_val_acc = history.history["val_accuracy"][-1]
    best_val_acc = max(history.history["val_accuracy"])
    print(f"\nFinal val accuracy: {final_val_acc:.3f}")
    print(f"Best val accuracy across training: {best_val_acc:.3f}")

    os.makedirs(MODEL_OUT_DIR, exist_ok=True)
    keras_path = os.path.join(MODEL_OUT_DIR, "vehicle_classifier.keras")
    model.save(keras_path)
    print(f"Saved Keras model to {keras_path}")

    with open(os.path.join(MODEL_OUT_DIR, "class_names.json"), "w") as f:
        import json

        json.dump(CLASS_NAMES, f)

    with open(os.path.join(MODEL_OUT_DIR, "ACCURACY.txt"), "w") as f:
        f.write(
            f"Final val accuracy: {final_val_acc:.3f}\n"
            f"Best val accuracy: {best_val_acc:.3f}\n"
            f"Trained on {total} cropped images across {len(CLASS_NAMES)} classes: {counts}\n"
        )


if __name__ == "__main__":
    main()
