import { forestDensity, landscapeNoise, type MapDefinition } from '../simulation/MapGenerator'
import type { RoadPath } from '../simulation/WorldState'

export const ROAD_SURFACE_SIZE = 1024
export const ROAD_GRASS_LIMIT = 256
export const ROAD_STONE_LIMIT = 96
export interface RoadDressing { x: number; z: number; scale: number; angle: number }
export interface RoadSurface {
  pixels: Uint8Array
  coverage: Float32Array
  grass: RoadDressing[]
  stones: RoadDressing[]
  size: number
  extent: number
}
export interface MeadowField { coarse: Uint8Array; fine: Uint8Array; pixels: Uint8Array }
const clamp = (v: number) => Math.max(0, Math.min(1, v))
const smooth = (v: number) => { const t = clamp(v); return t * t * (3 - 2 * t) }
function hash(x: number, z: number, seed = 0): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(seed, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}
function noise(x: number, z: number, seed = 0): number {
  const ix = Math.floor(x), iz = Math.floor(z), tx = smooth(x - ix), tz = smooth(z - iz)
  const a = hash(ix, iz, seed), b = hash(ix + 1, iz, seed)
  const c = hash(ix, iz + 1, seed), d = hash(ix + 1, iz + 1, seed)
  return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz
}

/** Existing widths drive wear only; this never changes the saved corridor. */
export function roadWearProfile(width: number): { compaction: number; wheelTracks: number; centerGrass: number } {
  const traffic = clamp((width - 1.2) / 1.2)
  return { compaction: 0.64 + traffic * 0.34, wheelTracks: smooth((width - 1.3) / 0.8) * 0.09,
    centerGrass: Math.sin(traffic * Math.PI) * 0.16 }
}

/** Static meadow work is reused across road edits; no need to rebake empty land. */
export function createMeadowField(extent: number, size: number, map?: MapDefinition): MeadowField {
  const coarse = new Uint8Array(size * size), fine = new Uint8Array(size * size)
  const pixels = new Uint8Array(size * size * 4), unit = extent / size, half = extent / 2
  const rgb = [97, 114, 72]
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const i = z * size + x, wx = (x + 0.5) * unit - half, wz = (z + 0.5) * unit - half
    coarse[i] = Math.round(noise(wx * 0.65, wz * 0.65, 9) * 255)
    fine[i] = Math.round(noise(wx * 3.1, wz * 3.1, 17) * 255)
    const regional = map ? (landscapeNoise(wx / 27, wz / 27, map.seed + 101) - 0.5) * 18 - forestDensity(wx, wz, map) * 10 : 0
    const tint = regional + (coarse[i] / 255 - 0.5) * 9 + (fine[i] / 255 - 0.5) * 3
    for (let c = 0; c < 3; c++) pixels[i * 4 + c] = Math.round(rgb[c] + tint)
    pixels[i * 4 + 3] = 255
  }
  return { coarse, fine, pixels }
}

/** Opaque terrain albedo, not alpha decals: every texel is resolved once for the
 * whole network. Max-union coverage makes crossings independent of draw order.
 * Generated only when road data changes. No Three.js or simulation mutation. */
export function createRoadSurface(
  roads: readonly RoadPath[], extent: number, size = ROAD_SURFACE_SIZE,
  meadow = createMeadowField(extent, size),
): RoadSurface {
  const count = size * size, coverage = new Float32Array(count)
  if (roads.length === 0) {
    return { pixels: meadow.pixels, coverage, size, extent, grass: [], stones: [] }
  }
  const wear = new Float32Array(count)
  const { coarse, fine } = meadow
  const pixels = meadow.pixels.slice(), unit = extent / size, half = extent / 2
  const pixel = (v: number) => Math.max(0, Math.min(size - 1, Math.floor((v + half) / unit)))
  for (const road of roads) {
    const profile = roadWearProfile(road.width)
    // Persisted frontage junctions may split a straight segment. Collapse only
    // redundant collinear samples locally so they cannot stamp extra endcaps.
    const points = road.points.filter((p, i, list) => {
      if (i === 0 || i === list.length - 1) return true
      const a = list[i - 1], b = list[i + 1]
      const cross = (p.x - a.x) * (b.z - p.z) - (p.z - a.z) * (b.x - p.x)
      return Math.abs(cross) > 1e-8 || (p.x - a.x) * (b.x - p.x) + (p.z - a.z) * (b.z - p.z) < 0
    })
    let travelled = 0
    for (let segment = 1; segment < points.length; segment++) {
      const a = points[segment - 1], b = points[segment]
      const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz)
      if (length < 0.0001) continue
      const radius = road.width * 0.5, margin = radius + 0.75
      // Rasterize a narrow scan band along the dominant axis, rather than the
      // entire diagonal bounding box. Work follows road length, not box area.
      const horizontal = Math.abs(dx) >= Math.abs(dz)
      const aMajor = horizontal ? a.x : a.z, bMajor = horizontal ? b.x : b.z
      const aMinor = horizontal ? a.z : a.x, bMinor = horizontal ? b.z : b.x
      for (let major = pixel(Math.min(aMajor, bMajor) - margin); major <= pixel(Math.max(aMajor, bMajor) + margin); major++) {
        const worldMajor = (major + 0.5) * unit - half
        const tMajor = clamp((worldMajor - aMajor) / (bMajor - aMajor))
        const minorCenter = aMinor + (bMinor - aMinor) * tMajor
        const along = travelled + length * tMajor
        const quiet = noise(along * 0.19, road.id * 0.71, 31)
        const wander = (noise(along * 0.42, road.id, 47) - 0.5) * road.width * 0.18
        const rightTrack = smooth((noise(along * 0.65, road.id + 3, 41) - 0.43) / 0.3)
        const leftTrack = smooth((noise(along * 0.65, road.id + 7, 41) - 0.43) / 0.3)
        for (let minor = pixel(minorCenter - margin * 1.5); minor <= pixel(minorCenter + margin * 1.5); minor++) {
          const x = horizontal ? major : minor, z = horizontal ? minor : major, i = z * size + x
          const wx = (x + 0.5) * unit - half, wz = (z + 0.5) * unit - half
          const t = clamp(((wx - a.x) * dx + (wz - a.z) * dz) / (length * length))
          const distance = Math.hypot(wx - a.x - dx * t, wz - a.z - dz * t)
          const edge = radius + (coarse[i] / 255 - 0.5) * 0.46 + (fine[i] / 255 - 0.5) * 0.18
          const shoulder = smooth((edge + 0.36 - distance) / 0.65)
          if (shoulder <= 0) continue
          const center = 1 - smooth(distance / Math.max(0.1, radius * 0.45))
          const island = smooth((coarse[i] / 255 - 0.65) / 0.22) * (1 - profile.compaction) * 0.65
          const strength = shoulder * (profile.compaction - profile.centerGrass * center * quiet - island)
          coverage[i] = Math.max(coverage[i], shoulder)
          // Broken, wandering tracks, with long quiet gaps and unequal sides.
          const lateral = ((wx - a.x) * dz - (wz - a.z) * dx) / length
          const trackDistance = Math.abs(Math.abs(lateral - wander) - road.width * (0.18 + quiet * 0.06))
          const track = (1 - smooth(trackDistance / 0.13)) * (lateral > 0 ? rightTrack : leftTrack)
          wear[i] = Math.max(wear[i], strength + track * profile.wheelTracks * shoulder)
        }
      }
      travelled += length
    }
  }
  const earthRGB = [132, 116, 88]
  for (let i = 0; i < count; i++) {
    if (wear[i] === 0) continue
    const dirt = (coarse[i] / 255 - 0.5) * 13 + (fine[i] / 255 - 0.5) * 5 + (hash(i % size, Math.floor(i / size), 23) - 0.5) * 5
    const w = clamp(wear[i])
    // Low-contrast earth. Saturation is intentionally restrained at both camera heights.
    for (let c = 0; c < 3; c++) {
      const grassColor = pixels[i * 4 + c]
      const dirtColor = earthRGB[c] + dirt
      pixels[i * 4 + c] = Math.round(grassColor + (dirtColor - grassColor) * w)
    }
    pixels[i * 4 + 3] = 255
  }
  const surface: RoadSurface = { pixels, coverage, size, extent, grass: [], stones: [] }
  // A world-space candidate scatter avoids one decoration per segment. Cluster
  // gates leave long quiet areas; denser curves never multiply decoration counts.
  for (let i = 0; i < 6000; i++) {
    const x = (hash(i, 2, 61) - 0.5) * extent, z = (hash(i, 5, 61) - 0.5) * extent
    const cover = roadCoverageAt(surface, x, z)
    if (cover < 0.08 || cover > 0.78) continue
    const patch = noise(x * 0.48, z * 0.48, 71)
    const dressing = { x, z, scale: 0.55 + hash(i, 7) * 0.75, angle: hash(i, 9) * Math.PI * 2 }
    if (patch > 0.57 && surface.grass.length < ROAD_GRASS_LIMIT) surface.grass.push(dressing)
    if (patch < 0.24 && hash(i, 8) > 0.72 && surface.stones.length < ROAD_STONE_LIMIT) surface.stones.push(dressing)
  }
  return surface
}

export function roadCoverageAt(surface: RoadSurface, x: number, z: number): number {
  const px = Math.floor((x / surface.extent + 0.5) * surface.size)
  const pz = Math.floor((z / surface.extent + 0.5) * surface.size)
  return px < 0 || pz < 0 || px >= surface.size || pz >= surface.size ? 0 : surface.coverage[pz * surface.size + px]
}
