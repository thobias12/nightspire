import { LANDSCAPES, MAP_SIZES, type Landscape, type MapDefinition, type MapSize } from '../data/map'
import { createInitialWorldState, type WorldState } from '../model/WorldState'
import { landscapeNoise, mapHash } from './MapNoise'
import { regionalForest, terrainWater, waterDistance } from './MapTerrain'
export { landscapeNoise, mapHash } from './MapNoise'
export const MAX_MAP_NODES = 4096
export const worldHalf = (s: Pick<WorldState, 'map'>): number => ((s.map?.size ?? 47) - 1) / 2

/** Continuous woodland masses, with a guaranteed spacious starting clearing. */
export function forestDensity(x: number, z: number, map: MapDefinition): number {
  if (map.version === 2) return regionalForest(x,z,map)
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

export function createGeneratedWorld(seed = 137, size: MapSize = 257, landscape: Landscape = 'meadows', version: 1 | 2 = 1): WorldState {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff || !MAP_SIZES.includes(size)
    || !Object.hasOwn(LANDSCAPES, landscape) || ![1,2].includes(version)
    || version === 1 && !['meadows','woodland'].includes(landscape)) throw new Error('Invalid map settings.')
  const state = createInitialWorldState()
  state.map = { version, seed, size, landscape }
  state.nodes = []
  const used = new Set<string>(), half = (size - 1) / 2
  const add = (x: number, z: number, resource: 'wood' | 'food' | 'ore') => {
    x = Math.round(x) || 0; z = Math.round(z) || 0
    const key = x + ',' + z
    if (used.has(key) || Math.abs(x) > half - 3 || Math.abs(z) > half - 3 || Math.hypot(x, z) < 9 || terrainWater(x,z,state.map)) return false
    if (resource === 'wood' && waterDistance(x,z,state.map) < 4) return false
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
  if (version === 2) {
    // Regional food/mineral deposits are legible clusters, not isolated confetti.
    for (let site=0;site<10;site++) {
      const a=angle+site*Math.PI*0.2, radius=half*(0.53+mapHash(site,40,seed)*0.24)
      const cx=Math.cos(a)*radius,cz=Math.sin(a)*radius,resource=site%2?'ore':'food'
      for(let i=0;i<18;i++) {
        const r=1+Math.sqrt(mapHash(site,i,seed+88))*6, t=i*2.399
        add(cx+Math.cos(t)*r,cz+Math.sin(t)*r,resource)
      }
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
    else if (version === 1 && density > 0.08 && density < 0.45 && roll > 0.93) candidate(px, pz, 'food')
    else if (version === 1 && landscapeNoise(px / 19, pz / 19, seed + 71) > 0.8 && roll > 0.88) candidate(px, pz, 'ore')
  }
  candidates.sort((a, b) => a.rank - b.rank)
  for (const p of candidates) {
    if (state.nodes.length >= MAX_MAP_NODES) break
    add(p.x, p.z, p.resource)
  }
  state.events = ['New ' + LANDSCAPES[landscape].name + ' · ' + size + 'm · seed ' + seed + '. Nearby wood, food and ore surround the camp clearing.']
  return state
}
