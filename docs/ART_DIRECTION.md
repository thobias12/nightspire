# Art and character direction

## Goal

Spend the highest art budget on the characters the player actually inspects while keeping the city, crowds and equipment scalable for a small team using Three.js.

## Overall style

Stylized dark fantasy rather than photorealism.

Priorities:

1. strong silhouettes
2. attractive readable characters
3. warm city lighting vs cold dangerous nights
4. modular/reusable assets
5. materials and variation doing more work than unique meshes

## Adult female characters

All sexualized characters are clearly adults.

Important/named female characters can lean deliberately attractive and stylized, with:

- varied adult body proportions
- fitted fantasy clothing/armor
- modular hairstyles
- makeup/tattoos/material variation
- hair/cloth secondary motion
- selective body secondary motion for hero-quality characters

Avoid making every citizen hero-quality.

## Shared body strategy

Prefer a small number of excellent base bodies/rigs over dozens of unique character meshes.

A future adult female base should support:

- one shared skeleton
- common animation set
- body morphs for silhouette variation
- shared equipment attachment conventions
- LOD variants

Potential morph dimensions include height, build, musculature, bust, hips and waist. Keep deformation ranges art-directed and compatible with equipment.

## Equipment strategy

Do not model a completely unique full body for every armor set.

Use three layers:

### 1. Material/body-conforming layer

For pieces that follow the body closely, prefer masks/material/normal/roughness variation where visually sufficient:

- cloth bodysuits
- fitted leather
- stockings/leggings
- simple corset-like elements
- tight chain/scale patterns
- tattoos/decorative markings

### 2. Modular silhouette meshes

Spend geometry where it changes silhouette:

- breastplates/chest shells
- skirts/tabards
- belts/waist pieces
- boots
- gauntlets
- pauldrons
- capes
- headwear/horns/crowns
- hair

### 3. Hero effects

Reserve extra shaders, cloth/hair simulation, glowing runes and richer materials for named/nearby characters.

## Suggested equipment slots

- Head
- Chest
- Legs
- Boots
- Gloves
- Waist
- Back/Cape
- Weapon

Keep combat stats separate from cosmetic presentation where possible so attractive outfit design does not have to obey realistic armor coverage.

## Crowd tiers

### Hero / inspection tier

Named companions, important service characters, commanders:

- highest LOD
- full skeletal animation
- richer hair/materials
- secondary motion
- facial expression support later

### Nearby citizen tier

- shared rig
- lower material complexity
- simplified hair/cloth
- limited secondary physics

### Crowd tier

- lower poly
- aggressively shared geometry/materials
- reduced animation/update frequency
- no expensive per-character secondary physics

## Buildings and city kit

Use modular kits instead of bespoke buildings wherever possible.

Initial reusable pieces:

- timber wall sections
- stone wall sections
- roofs
- doors/windows
- beams/posts
- fences
- stairs
- towers
- gates
- props/market pieces

Silhouette, roof shape, props, banners, lighting and material variation should create identity before unique modeling is commissioned.

## What not to build early

- dozens of finished armor sets
- explicit sex animations
- detailed building interiors for every structure
- unique faces for every citizen
- unique skeletons per race/class
- expensive cloth simulation on background characters

Prove gameplay and the shared character/equipment pipeline first.
