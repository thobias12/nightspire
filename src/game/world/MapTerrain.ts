import { LANDSCAPES, type MapDefinition } from '../data/map'
import type { Point } from '../model/WorldState'
import { cellKey } from './Grid'
import { landscapeNoise, mapHash } from './MapNoise'

const clamp = (n: number) => Math.max(0, Math.min(1, n))
const half = (map: MapDefinition) => (map.size - 1) / 2
export function riverCenter(z: number, map: MapDefinition): number {
  const h = half(map), phase = mapHash(3, 8, map.seed) * Math.PI * 2
  return (mapHash(1, 5, map.seed) > 0.5 ? 1 : -1) * (Math.max(44, h * 0.43)
    + Math.sin(z / h * 3.3 + phase) * Math.min(6, h * 0.06)
    + Math.sin(z / h * 6.1 + phase * 0.7) * h * 0.025)
}
export const riverWidth = (map: MapDefinition): number => Math.max(1.8, half(map) * 0.018)
export const riverFords = (map: MapDefinition): number[] => [-0.56, 0, 0.56].map(t => t * half(map))
export const isFord = (z: number, map: MapDefinition): boolean =>
  Math.abs(z) <= 2.5 || Math.abs(z - half(map) * 0.56) <= 2.5 || Math.abs(z + half(map) * 0.56) <= 2.5
export function mapLakes(map: MapDefinition): { x: number; z: number; rx: number; rz: number; angle: number }[] {
  if (map.version !== 2 || map.landscape !== 'lakeland') return []
  const h = half(map)
  return [[-0.61,-0.48],[0.58,0.47],[0.55,-0.65]].map(([x,z], i) => ({
    x: x * h, z: z * h, rx: h * (0.13 + mapHash(i, 7, map.seed) * 0.06),
    rz: h * (0.1 + mapHash(i, 9, map.seed) * 0.05), angle: mapHash(i, 11, map.seed) * Math.PI,
  }))
}
const lakesCache = new WeakMap<MapDefinition, ReturnType<typeof mapLakes>>()
export function waterDistance(x: number, z: number, map?: MapDefinition): number {
  if (!map || map.version !== 2) return Infinity
  if (map.landscape === 'riverlands') return Math.abs(x - riverCenter(z, map)) - riverWidth(map)
  if (map.landscape !== 'lakeland') return Infinity
  let lakes = lakesCache.get(map)
  if (!lakes) { lakes = mapLakes(map); lakesCache.set(map, lakes) }
  let distance = Infinity
  for (const lake of lakes) {
    const dx = x - lake.x, dz = z - lake.z, c = Math.cos(lake.angle), s = Math.sin(lake.angle)
    const u = (dx * c + dz * s) / lake.rx, v = (-dx * s + dz * c) / lake.rz
    const ripple = 1 + Math.sin(Math.atan2(v, u) * 3 + lake.angle) * 0.07
    distance = Math.min(distance, (Math.hypot(u, v) - ripple) * Math.min(lake.rx, lake.rz))
  }
  return distance
}
export const terrainWater = (x: number, z: number, map?: MapDefinition): boolean =>
  waterDistance(x, z, map) < 0 && !(map?.landscape === 'riverlands' && isFord(z, map))

/** Broad coherent woodland, warped edges, a network of meadow rides and glades. */
export function regionalForest(x: number, z: number, map: MapDefinition): number {
  const h = half(map), scale = Math.max(25, h * 0.26)
  const warpX = x + (landscapeNoise(x / 61, z / 61, map.seed + 13) - 0.5) * scale * 0.8
  const warpZ = z + (landscapeNoise(x / 57, z / 57, map.seed + 23) - 0.5) * scale * 0.8
  const broad = landscapeNoise(warpX / scale, warpZ / scale, map.seed)
  const edge = landscapeNoise(x / 10, z / 10, map.seed + 17)
  const ride = Math.abs(z - Math.sin(x / (h * 0.55) + map.seed % 11) * h * 0.25)
  const openness = clamp((Math.hypot(x,z) - 17) / 15) * (0.28 + clamp(ride / 8) * 0.72)
  return clamp((broad * 0.82 + edge * 0.18 - LANDSCAPES[map.landscape].forest) * 4.3)
    * openness * clamp((waterDistance(x,z,map) - 1) / 5)
}

const blockedCache = new WeakMap<MapDefinition, ReadonlySet<number>>()
const empty = new Set<number>()
/** Static terrain is sampled once per map, never independently per NPC/frame. */
export function terrainBlocked(map?: MapDefinition): ReadonlySet<number> {
  if (!map || map.version !== 2 || !['riverlands','lakeland'].includes(map.landscape)) return empty
  const cached = blockedCache.get(map)
  if (cached) return cached
  const cells = new Set<number>(), h = half(map)
  for (let z = -h; z <= h; z++) for (let x = -h; x <= h; x++) {
    if (terrainWater(x,z,map)) cells.add(cellKey({x,z}))
  }
  blockedCache.set(map,cells)
  return cells
}

export function terrainRouteError(points: readonly Point[], map?: MapDefinition, width = 0): string | null {
  if (!terrainBlocked(map).size) return null
  for (let i = 1; i < points.length; i++) {
    const a = points[i-1], b = points[i], dx = b.x-a.x, dz = b.z-a.z, length = Math.hypot(dx,dz)
    const steps = Math.max(1, Math.ceil(length * 3)), nx = length ? -dz/length : 0, nz = length ? dx/length : 0
    for (let j = 0; j <= steps; j++) for (const side of [-0.5,0,0.5]) {
      if (terrainWater(a.x+dx*j/steps+nx*width*side,a.z+dz*j/steps+nz*width*side,map)) return 'Keep roads on dry land; cross the river at a ford.'
    }
  }
  return null
}
export function terrainPolygonError(points: readonly Point[], map?: MapDefinition): string | null {
  if (points.length < 3 || !terrainBlocked(map).size) return null
  if (terrainRouteError([...points,points[0]],map)) return 'Keep the whole parcel on dry land.'
  const minX=Math.floor(Math.min(...points.map(p=>p.x))), maxX=Math.ceil(Math.max(...points.map(p=>p.x)))
  const minZ=Math.floor(Math.min(...points.map(p=>p.z))), maxZ=Math.ceil(Math.max(...points.map(p=>p.z)))
  for (let z=minZ;z<=maxZ;z++) for(let x=minX;x<=maxX;x++) {
    if (!terrainWater(x,z,map)) continue
    let inside=false
    for(let i=0,j=points.length-1;i<points.length;j=i++) {
      const a=points[i],b=points[j]
      if ((a.z>z)!==(b.z>z) && x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x) inside=!inside
    }
    if(inside) return 'Keep the whole parcel on dry land.'
  }
  return null
}
