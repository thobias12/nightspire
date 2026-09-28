import { createInitialWorldState, type WorldState } from '../model/WorldState'

export const MAP_SIZES = [129, 257, 513] as const
export type MapSize = typeof MAP_SIZES[number]
export type Landscape = 'meadows' | 'woodland'
export interface MapDefinition { version: 1; seed: number; size: MapSize; landscape: Landscape }
export const MAX_MAP_NODES = 4096
export const worldHalf = (s: Pick<WorldState, 'map'>): number => ((s.map?.size ?? 47) - 1) / 2

export function mapHash(x: number, z: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(seed, 1274126177)
  h = Math.imul(h ^ h >>> 13, 1274126177)
  return ((h ^ h >>> 16) >>> 0) / 4294967296
}
export function landscapeNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x), iz = Math.floor(z)
  const smooth = (t: number) => t * t * (3 - 2 * t)
  const tx = smooth(x - ix), tz = smooth(z - iz)
  const a = mapHash(ix, iz, seed), b = mapHash(ix + 1, iz, seed)
  const c = mapHash(ix, iz + 1, seed), d = mapHash(ix + 1, iz + 1, seed)
  return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz
}

/** Continuous woodland masses, with a guaranteed spacious starting clearing. */
export function forestDensity(x: number, z: number, map: MapDefinition): number {
  const clearing = Math.min(1, Math.max(0, (Math.hypot(x, z) - 16) / 14))
  const broad = landscapeNoise(x / 42, z / 42, map.seed)
  const edge = landscapeNoise(x / 11, z / 11, map.seed + 17)
  return Math.max(0, Math.min(1, (broad * 0.78 + edge * 0.22 - (map.landscape === 'woodland' ? 0.35 : 0.47)) * 4)) * clearing
}

/** Flat valley floor remains compatible with all existing construction. Hills
 * rise only beyond the playable boundary; this is not a slope/terraforming system. */
export function horizonHeight(x: number, z: number, map: MapDefinition): number {
  const outside = Math.max(Math.abs(x), Math.abs(z)) - (map.size - 1) / 2 - 15 - landscapeNoise(x / 55, z / 55, map.seed + 77) * 35
  const ramp = Math.min(1, Math.max(0, outside / 45))
  return ramp * ramp * (8 + landscapeNoise(x / 65, z / 65, map.seed + 41) * 35)
}

export function createGeneratedWorld(seed = 137, size: MapSize = 257, landscape: Landscape = 'meadows'): WorldState {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff || !MAP_SIZES.includes(size)
    || !['meadows', 'woodland'].includes(landscape)) throw new Error('Invalid map settings.')
  const state = createInitialWorldState()
  state.map = { version: 1, seed, size, landscape }
  state.nodes = []
  const used = new Set<string>(), half = (size - 1) / 2
  const add = (x: number, z: number, resource: 'wood' | 'food' | 'ore') => {
    x = Math.round(x) || 0; z = Math.round(z) || 0
    const key = x + ',' + z
    if (used.has(key) || Math.abs(x) > half - 3 || Math.abs(z) > half - 3 || Math.hypot(x, z) < 9) return false
    used.add(key)
    state.nodes.push({ id: state.nextId++, x, z, resource, remaining: resource === 'ore' ? 30 : 40 })
    return true
  }
  // Every seed has the same useful opening quantities, arranged in small copses.
  const angle = mapHash(1, 1, seed) * Math.PI * 2
  for (const [resource, count, radius, phase] of [['wood', 40, 19, 0], ['food', 20, 14, 2.1], ['ore', 12, 25, 4.2]] as const) {
    let placed = 0
    for (let i = 0; placed < count && i < 400; i++) {
      const a = angle + phase + (i % 2) * 0.8
      const cx = Math.cos(a) * radius, cz = Math.sin(a) * radius
      const spread = 2 + Math.sqrt(mapHash(i, 12, seed + count)) * (resource === 'wood' ? 6 : 4)
      if (add(cx + Math.cos(i * 2.399) * spread, cz + Math.sin(i * 2.399) * spread, resource)) placed++
    }
  }
  // Bounded candidates and output, independent of population. Blue-noise-like
  // jitter avoids rows; coherent density leaves linked expanses of open meadow.
  const candidates: { x: number; z: number; resource: 'wood' | 'food' | 'ore'; rank: number }[] = []
  const candidate = (x: number, z: number, resource: 'wood' | 'food' | 'ore') => candidates.push({ x, z, resource, rank: mapHash(Math.round(x), Math.round(z), seed + 199) })
  const spacing = size === 513 ? 5 : 3
  for (let z = -half + 4; z < half - 3; z += spacing) for (let x = -half + 4; x < half - 3; x += spacing) {
    const px = x + mapHash(x, z, seed + 3) * (spacing - 1)
    const pz = z + mapHash(x, z, seed + 5) * (spacing - 1)
    if (Math.hypot(px, pz) < 31) continue
    const density = forestDensity(px, pz, state.map)
    const roll = mapHash(x, z, seed + 9)
    if (roll < density * 0.9) candidate(px, pz, 'wood')
    else if (density > 0.08 && density < 0.45 && roll > 0.93) candidate(px, pz, 'food')
    else if (landscapeNoise(px / 19, pz / 19, seed + 71) > 0.8 && roll > 0.88) candidate(px, pz, 'ore')
  }
  candidates.sort((a, b) => a.rank - b.rank)
  for (const p of candidates) {
    if (state.nodes.length >= MAX_MAP_NODES) break
    add(p.x, p.z, p.resource)
  }
  state.events = ['New ' + size + 'm region · seed ' + seed + '. The camp clearing has nearby wood, food and ore.']
  return state
}
