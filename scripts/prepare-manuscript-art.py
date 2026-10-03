"""Cut the selected generated sheets into canonical images; never repaint variants.

Requires Pillow as a developer tool only. Example:
python scripts/prepare-manuscript-art.py --scenes sheet.png --portraits people.png
All HUD sizes subsequently crop/scale the same checked-in WebP for each subject.
"""
import argparse
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "assets/ui/manuscript"


def cut_sheet(source, grid, names, folder, inset=(0, 0), row_bounds=None):
    image = Image.open(source).convert("RGB")
    columns, rows = grid
    if len(names) != columns * rows:
        raise ValueError("Sheet names must exactly fill the grid")
    target = OUTPUT / folder
    target.mkdir(parents=True, exist_ok=True)
    for index, name in enumerate(names):
        x, y = index % columns, index // columns
        # Round shared boundaries once. A 1024px sheet need not divide by seven.
        top, bottom = row_bounds[y] if row_bounds else (round(y * image.height / rows), round((y + 1) * image.height / rows))
        box = (round(x * image.width / columns), top, round((x + 1) * image.width / columns), bottom)
        # Generated sheet gutters can contain a few pixels of the neighboring
        # row. Trim those once in the canonical source, never in size variants.
        dx, dy = inset
        box = (box[0] + dx, box[1] + dy, box[2] - dx, box[3] - dy)
        image.crop(box).save(target / f"{name}.webp", quality=86, method=6)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scenes", required=True, type=Path)
    parser.add_argument("--portraits", required=True, type=Path)
    args = parser.parse_args()
    manifest = json.loads((OUTPUT / "manifest.json").read_text())
    cut_sheet(args.scenes, manifest["sceneGrid"], manifest["scenes"], "building", manifest["sceneSheetInset"], manifest["sceneRowBounds"])
    cut_sheet(args.portraits, manifest["portraitGrid"], manifest["portraits"], "portrait")
    print("Prepared 28 canonical scenes and 10 portraits; no size-specific repaints.")
