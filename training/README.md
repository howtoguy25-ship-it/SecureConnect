# Emergency vehicle classifier training

Trains a real (not fabricated) police-car / ambulance / firetruck / other classifier,
fine-tuned from MobileNetV2 on a labeled dataset. This runs *behind* the existing
generic COCO-SSD vehicle detector in both apps: COCO-SSD finds "there's a vehicle
here," then this model classifies what kind.

## Data

Source: [Roboflow "Emergency vehicles" dataset](https://universe.roboflow.com/traffic-rbwic/emergency-vehicles-snzgj)
(CC BY 4.0), 242 images / 544 labeled boxes. Real counts, not inflated:

| class | train | valid |
|---|---|---|
| ambulance | ~190 | ~26 |
| police-car | ~115 | ~16 |
| firetruck | ~86 | ~12 |
| other (car/bus/truck/van/motorcycle merged) | ~90 | ~14 |

This is a modest dataset — good enough for a real first version, not a
production-grade, thousands-of-images model. Expect the reported validation
accuracy (see `model/ACCURACY.txt` after training) to reflect that; the app UI
should show this as a confidence level, not an infallible ID.

## Pipeline

```bash
cd training
pip install tensorflow-cpu pillow numpy tensorflowjs

python3 prepare_crops.py      # crops labeled boxes into crops/{train,valid}/{class}/
python3 train_classifier.py   # trains + saves model/vehicle_classifier.keras

tensorflowjs_converter --input_format=keras \
  model/vehicle_classifier.keras model/tfjs
```

`model/tfjs/` (the converted output — `model.json` + weight shard files) is what
actually ships in both apps. `model/class_names.json` lists the output order.

## Re-running with more data later

Re-export a newer Roboflow version (or a different/bigger dataset with the same
class names) into `dataset/`, re-run `prepare_crops.py` + `train_classifier.py`.
The class-weighting in `train_classifier.py` handles imbalance automatically, so
you don't need to manually balance the dataset first.
