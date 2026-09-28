import { worldHalf } from './MapGenerator'
import { RegionalRouter } from './RegionalNavigation'
import { BUILDINGS } from '../../data/buildings'
import { PATH_BUDGET } from '../../data/jobs'
import type { Building, Enemy, Point, Settler, WorldState } from './WorldState'

export const MAP_MIN = -23, MAP_MAX = 23, MAP_SIZE = 47
export const PATH_RETRY_TICKS = 40
// Fixed key stride covers every supported region without changing keys on load.
export const cellKey = (p: Point): number => (Math.round(p.z) + 512) * 1025 + Math.round(p.x) + 512
export const inBounds = (p: Point, half = MAP_MAX): boolean => Math.abs(p.x) <= half && Math.abs(p.z) <= half
export const entrance = (b: Building): Point => ({ x: b.x, z: b.z + Math.floor(BUILDINGS[b.type].footprint / 2) + 1 })
export const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.z - b.z)

export function footprint(b: Pick<Building, 'x' | 'z' | 'type'>): Point[] {
  const half = Math.floor(BUILDINGS[b.type].footprint / 2), cells: Point[] = []
  for (let z = -half; z <= half; z++) for (let x = -half; x <= half; x++) cells.push({ x: b.x + x, z: b.z + z })
  return cells
}

export function occupiedCells(state: WorldState): Set<number> {
  return new Set(state.buildings.flatMap(footprint).map(cellKey))
}

export function blockedCells(state: WorldState, hostile = false): Set<number> {
  const cells: number[] = []
  for (const building of state.buildings) {
    if (building.destroyed) continue
    const def = BUILDINGS[building.type]
    const blocks = hostile ? building.complete : (!building.complete || !def.friendlyPassable)
    if (blocks) for (const p of footprint(building)) cells.push(cellKey(p))
  }
  return new Set(cells)
}

export function interactionPoints(building: Building, half = MAP_MAX): Point[] {
  const radius = Math.floor(BUILDINGS[building.type].footprint / 2)
  const distanceFromCenter = radius + 1
  const points: Point[] = []
  for (let offset = -radius; offset <= radius; offset++) {
    points.push(
      { x: building.x + offset, z: building.z - distanceFromCenter },
      { x: building.x + offset, z: building.z + distanceFromCenter },
      { x: building.x - distanceFromCenter, z: building.z + offset },
      { x: building.x + distanceFromCenter, z: building.z + offset },
    )
  }
  return points.filter(p => inBounds(p, half))
}

export function closestInteractionPoint(building: Building, from: Point, blocked: Set<number>, half = MAP_MAX): Point {
  const candidates = interactionPoints(building, half).filter(p => !blocked.has(cellKey(p)))
  return (candidates.length ? candidates : interactionPoints(building, half))
    .sort((a, b) => distance(from, a) - distance(from, b))[0] ?? entrance(building)
}

const neighbors = (p: Point): Point[] => [
  { x: p.x + 1, z: p.z }, { x: p.x - 1, z: p.z },
  { x: p.x, z: p.z + 1 }, { x: p.x, z: p.z - 1 },
]

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

type NavigatingAgent = Settler | Enemy

// Settlers/player and raiders share one bounded request queue, but use different blocker sets.
// A completed gate is friendly-passable while remaining a hostile blocker.
export class Navigation {
  private revision = -1
  private half = 23
  private router: RegionalRouter | null = null
  private friendlyBlocked = new Set<number>()
  private hostileBlocked = new Set<number>()
  private queue = new Map<number, Point>()
  private retryAfter = new Map<number, number>()
  private queuedAt = new Map<number, number>()
  readonly waitTicks: number[] = []
  requests = 0
  solved = 0
  failures = 0

  get depth(): number { return this.queue.size }

  reset(): void {
    this.revision = -1
    this.queue.clear()
    this.queuedAt.clear()
    this.retryAfter.clear()
  }

  sync(state: WorldState): void {
    const half = worldHalf(state)
    if (half !== this.half) { this.half = half; this.router = state.map ? new RegionalRouter(half) : null; this.revision = -1 }
    if (state.topology === this.revision) return
    this.friendlyBlocked = blockedCells(state, false)
    this.hostileBlocked = blockedCells(state, true)
    this.revision = state.topology
    this.queue.clear()
    this.queuedAt.clear()
    this.retryAfter.clear()
    for (const a of [...state.settlers, ...state.enemies]) { a.path = []; a.pathRevision = -1 }
  }

  walkable(point: Point, hostile = false): boolean {
    const blocked = hostile ? this.hostileBlocked : this.friendlyBlocked
    return inBounds(point, this.half) && !blocked.has(cellKey(point))
  }

  request(id: number, target: Point, tick: number): boolean {
    if ((this.retryAfter.get(id) ?? 0) > tick) return false
    if (this.queue.has(id)) return true
    this.queue.set(id, target)
    this.queuedAt.set(id, tick)
    this.requests++
    return true
  }

  isRetrying(id: number, tick: number): boolean {
    return (this.retryAfter.get(id) ?? 0) > tick
  }

  private agent(state: WorldState, id: number): NavigatingAgent | undefined {
    return state.settlers.find(a => a.id === id) ?? state.enemies.find(a => a.id === id)
  }

  process(state: WorldState): void {
    this.solved = 0
    this.waitTicks.length = 0
    for (const [id, target] of this.queue) {
      if (this.solved >= PATH_BUDGET) break
      this.queue.delete(id)
      this.waitTicks.push(state.tick - (this.queuedAt.get(id) ?? state.tick))
      this.queuedAt.delete(id)
      this.solved++

      const agent = this.agent(state, id)
      if (!agent) continue
      const hostile = state.enemies.some(e => e.id === id)
      if (state.map) {
        this.router ??= new RegionalRouter(this.half)
        const path = this.router.route(agent, target, hostile ? this.hostileBlocked : this.friendlyBlocked)
        if (path) { this.retryAfter.delete(id); agent.path = path; agent.pathRevision = state.topology }
        else { this.failures++; this.retryAfter.set(id, state.tick + PATH_RETRY_TICKS); agent.path = []; agent.pathRevision = -1; agent.status = 'Route blocked — retrying' }
        continue
      }
      const parents = flood(target, hostile ? this.hostileBlocked : this.friendlyBlocked)
      let cursor: Point = { x: Math.round(agent.x), z: Math.round(agent.z) }

      if (!parents.has(cellKey(cursor))) {
        this.failures++
        this.retryAfter.set(id, state.tick + PATH_RETRY_TICKS)
        agent.path = []
        agent.pathRevision = -1
        agent.status = 'Route blocked — retrying'
        continue
      }

      this.retryAfter.delete(id)
      const path: Point[] = [cursor]
      while (parents.get(cellKey(cursor))) {
        cursor = parents.get(cellKey(cursor))!
        path.push(cursor)
      }
      agent.path = path
      agent.pathRevision = state.topology
    }
  }
}
