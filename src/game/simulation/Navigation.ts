import { BUILDINGS } from '../data/buildings'
import { PATH_BUDGET } from '../data/jobs'
import type { Building, Point, WorldState } from './WorldState'

export const MAP_MIN = -23, MAP_MAX = 23, MAP_SIZE = 47
export const cellKey = (p: Point): number => (Math.round(p.z) - MAP_MIN) * MAP_SIZE + Math.round(p.x) - MAP_MIN
export const inBounds = (p: Point): boolean => p.x >= MAP_MIN && p.x <= MAP_MAX && p.z >= MAP_MIN && p.z <= MAP_MAX
export const entrance = (b: Building): Point => ({ x: b.x, z: b.z + 2 })
export const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.z - b.z)
export function footprint(b: Pick<Building, 'x' | 'z' | 'type'>): Point[] {
  const half = Math.floor(BUILDINGS[b.type].footprint / 2), cells: Point[] = []
  for (let z = -half; z <= half; z++) for (let x = -half; x <= half; x++) cells.push({ x: b.x + x, z: b.z + z })
  return cells
}
export function blockedCells(state: WorldState): Set<number> {
  return new Set(state.buildings.flatMap(footprint).map(cellKey))
}
const neighbors = (p: Point): Point[] => [ { x: p.x + 1, z: p.z }, { x: p.x - 1, z: p.z }, { x: p.x, z: p.z + 1 }, { x: p.x, z: p.z - 1 } ]
export function flood(start: Point, blocked: Set<number>): Map<number, Point | null> {
  const origin = { x: Math.round(start.x), z: Math.round(start.z) }
  const parents = new Map<number, Point | null>()
  if (!inBounds(origin) || blocked.has(cellKey(origin))) return parents
  const queue = [origin]; parents.set(cellKey(origin), null)
  for (let i = 0; i < queue.length; i++) {
    for (const p of neighbors(queue[i])) {
      const key = cellKey(p)
      if (!inBounds(p) || blocked.has(key) || parents.has(key)) continue
      parents.set(key, queue[i]); queue.push(p)
    }
  }
  return parents
}
// One shared queue, at most two routes per fixed tick. Paths persist until topology changes.
export class Navigation {
  private revision = -1
  private blocked = new Set<number>()
  private queue = new Map<number, Point>()
  requests = 0
  solved = 0
  failures = 0
  get depth(): number { return this.queue.size }
  reset(): void { this.revision = -1; this.queue.clear() }
  sync(state: WorldState): void {
    if (state.topology === this.revision) return
    this.blocked = blockedCells(state); this.revision = state.topology; this.queue.clear()
    for (const s of state.settlers) { s.path = []; s.pathRevision = -1 }
  }
  walkable(point: Point): boolean { return inBounds(point) && !this.blocked.has(cellKey(point)) }
  request(id: number, target: Point): void {
    if (this.queue.has(id)) return
    this.queue.set(id, target); this.requests++
  }
  process(state: WorldState): void {
    this.solved = 0
    for (const [id, target] of this.queue) {
      if (this.solved >= PATH_BUDGET) break
      this.queue.delete(id); this.solved++
      const s = state.settlers.find(s => s.id === id)
      if (!s || s.jobId === null) continue
      const parents = flood(target, this.blocked)
      let cursor: Point = { x: Math.round(s.x), z: Math.round(s.z) }
      if (!parents.has(cellKey(cursor))) { this.failures++; s.status = 'Route blocked'; continue }
      const path: Point[] = [cursor]
      while (parents.get(cellKey(cursor))) { cursor = parents.get(cellKey(cursor))!; path.push(cursor) }
      s.path = path; s.pathRevision = state.topology
    }
  }
}
