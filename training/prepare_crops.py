"""
Crops labeled vehicle bounding boxes out of the Roboflow "Emergency vehicles" COCO
export into per-class image folders, ready for classifier training.

Classes kept: ambulance, police-car, firetruck (the ones we actually want to
distinguish), plus "other" (car/bus/truck/van/motorcycle merged as the negative
class -- these are what a generic vehicle detector would otherwise call "car").
Small regional classes (rickshaw/cng/bicycle/autorickshaw) are dropped: they're
not the "regular car" negative case we want and COCO-SSD (the generic detector
this classifier runs behind) wouldn't hand us those crops anyway.
"""

import json
import os
from PIL import Image

DATASET_DIR = os.path.join(os.path.dirname(__file__), "dataset", "extracted")
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "crops")

OTHER_CLASSES = {"car", "bus", "truck", "van", "motorcycle"}
KEEP_CLASSES = {"ambulance", "police-car", "firetruck"} | OTHER_CLASSES

PADDING_FRAC = 0.15  # extra margin around each box so the crop isn't razor-tight


def normalize_label(name: str) -> str:
    return "other" if name in OTHER_CLASSES else name


def process_split(split: str):
    ann_path = os.path.join(DATASET_DIR, split, "_annotations.coco.json")
    with open(ann_path) as f:
        data = json.load(f)

    cat_map = {c["id"]: c["name"] for c in data["categories"]}
    images_by_id = {img["id"]: img for img in data["images"]}

    counts = {}
    for ann in data["annotations"]:
        class_name = cat_map[ann["category_id"]]
        if class_name not in KEEP_CLASSES:
            continue
        label = normalize_label(class_name)

        img_info = images_by_id[ann["image_id"]]
        img_path = os.path.join(DATASET_DIR, split, img_info["file_name"])
        if not os.path.exists(img_path):
            continue

        x, y, w, h = ann["bbox"]
        pad_x, pad_y = w * PADDING_FRAC, h * PADDING_FRAC
        left = max(0, x - pad_x)
        top = max(0, y - pad_y)

        with Image.open(img_path) as im:
            right = min(im.width, x + w + pad_x)
            bottom = min(im.height, y + h + pad_y)
            if right <= left or bottom <= top:
                continue
            crop = im.convert("RGB").crop((left, top, right, bottom)).resize((224, 224))

            out_dir = os.path.join(OUTPUT_DIR, split, label)
            os.makedirs(out_dir, exist_ok=True)
            idx = counts.get(label, 0)
            crop.save(os.path.join(out_dir, f"{label}_{idx}.jpg"), quality=90)
            counts[label] = idx + 1

    print(f"{split}:", counts)


if __name__ == "__main__":
    for split in ["train", "valid"]:
        process_split(split)
