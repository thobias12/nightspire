"""Prepare compact shared surface maps from ignored CC0 Poly Haven sources."""
from pathlib import Path
from PIL import Image, ImageOps
import json
root = Path(__file__).resolve().parents[1]
out = root / 'assets/world/grounded'
records = []
for source, name in [('medieval_wood', 'timber'), ('grey_plaster', 'plaster'), ('grey_roof_01', 'roof'), ('fabric_pattern_07', 'cloth')]:
    for channel in ['color', 'normal', 'rough']:
        path = root / '.model-sources' / f'{source}-{channel}.jpg'
        if not path.exists():
            if channel != 'color': continue
            path = root / '.model-sources' / f'{source}-rough.jpg'
        image = Image.open(path).convert('RGB').resize((512, 512), Image.Resampling.LANCZOS)
        if channel == 'color':
            # Neutral light albedo: the existing instance palette supplies the dye.
            image = ImageOps.grayscale(image)
            image = image.point(lambda value: 170 + value / 3).convert('RGB')
        image.save(out / f'{name}-{channel}.webp', quality=82)
    records.append({'name': name, 'source': f'https://polyhaven.com/a/{source}', 'license': 'CC0-1.0', 'textureMax': 512})
(out / 'surfaces.json').write_text(json.dumps(records, indent=2))
