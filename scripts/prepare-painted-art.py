"""Prepare independently generated portrait cards and wide building paintings.

Only crop/resize/encode selected imagegen output, never draw replacement art.
Run with --generated-dir pointing to the directory recorded in the art note.
"""
import argparse
import json
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "assets/ui/manuscript"


def prepare(generated_dir):
    manifest = json.loads((OUTPUT / "manifest.json").read_text())
    sources = json.loads((OUTPUT / "art-sources.json").read_text())
    expected = {(name, variant) for name in manifest["scenes"] for variant in ("card", "wide")}
    entries = {(item["id"], item["variant"]): item for item in sources["images"]}
    if set(entries) != expected or len(entries) != len(sources["images"]):
        raise ValueError("Every scene needs exactly one selected card and one wide image")
    generated_dir = generated_dir.resolve()
    for (name, variant), entry in entries.items():
        source = (generated_dir / entry["source"]).resolve()
        if source.parent != generated_dir:
            raise ValueError("Sources must be filenames within the generated directory")
        image = Image.open(source).convert("RGB")
        size = tuple(manifest["imageSizes"][variant])
        image = ImageOps.fit(image, size, method=Image.Resampling.LANCZOS)
        target = OUTPUT / ("card" if variant == "card" else "building")
        target.mkdir(parents=True, exist_ok=True)
        image.save(target / f"{name}.webp", quality=86, method=6)
    print(f"Prepared {len(entries)} dedicated paintings, with no atlas boundaries.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--generated-dir", required=True, type=Path)
    prepare(parser.parse_args().generated_dir)
