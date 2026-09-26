import { BUILDINGS, type BuildingId } from '../data/buildings'
import type { JobKind } from '../data/jobs'
import { emptyInventory, type Inventory, type ResourceId } from '../data/resources'
import type { SettlerRole } from './Schedule'

export interface Point { x: number; z: number }
export interface PlayerState extends Point {
  health: number; maxHealth: number; attackCooldown: number; lastHitTick: number
}
export interface ResourceNode extends Point { id: number; resource: ResourceId; remaining: number }
export interface Building extends Point {
  id: number; type: BuildingId; complete: boolean; work: number
  health: number; maxHealth: number; destroyed: boolean; lastHitTick: number
  inventory: Inventory; delivered: Inventory
}
export interface Settler extends Point {
  id: number; homeId: number | null; jobId: number | null; role: SettlerRole
  health: number; maxHealth: number; attackCooldown: number; lastHitTick: number
  cargo: Inventory; path: Point[]; pathRevision: number; status: string
}
export interface Enemy extends Point {
  id: number; kind: 'raider'; targetId: number
  health: number; maxHealth: number; attackCooldown: number; lastHitTick: number
  path: Point[]; pathRevision: number; status: string
}
export interface RaidState {
  lastSpawnDay: number
  wave: number
  totalSpawned: number
  totalDefeated: number
  lastClearedWave: number
}
export interface Job {
  id: number; kind: JobKind; settlerId: number; sourceId: number; targetId: number
  resource: ResourceId; amount: number; stage: 'source' | 'work' | 'target'; progress: number
}
export interface WorldState {
  version: 1; nextId: number; tick: number; elapsedSeconds: number; day: number; timeOfDay: number
  topology: number; player: PlayerState; settlers: Settler[]; enemies: Enemy[]; nodes: ResourceNode[]; buildings: Building[]; jobs: Job[]
  targets: Inventory; raid: RaidState
  totals: { gathered: Inventory; deposited: Inventory; delivered: Inventory; constructed: number; repairedHealth: number; structureDamage: number }
  events: string[]
}
export const MAX_SETTLERS = 10
export const MAX_ENEMIES = 64
export const DEFAULT_TARGETS: Inventory = { wood: 150, food: 100 }
export const DEFAULT_RAID: RaidState = { lastSpawnDay: 0, wave: 0, totalSpawned: 0, totalDefeated: 0, lastClearedWave: 0 }

export function settlerLabel(state: WorldState, id: number): string {
  const index = state.settlers.findIndex(a => a.id === id)
  return index >= 0 ? 'Settler ' + (index + 1) : 'Settler ' + id
}
export function enemyLabel(state: WorldState, id: number): string {
  const index = state.enemies.findIndex(a => a.id === id)
  return index >= 0 ? 'Raider ' + (index + 1) : 'Raider ' + id
}
export function spawnSettler(state: WorldState): boolean {
  if (state.settlers.length >= MAX_SETTLERS) return false
  state.settlers.push({
    id: state.nextId++, x: 0, z: 2, homeId: null, jobId: null, role: 'worker',
    health: 100, maxHealth: 100, attackCooldown: 0, lastHitTick: 0,
    cargo: emptyInventory(), path: [], pathRevision: -1, status: 'Needs work',
  })
  return true
}
export function recordEvent(state: WorldState, message: string): void {
  state.events.unshift(message)
  state.events.length = Math.min(state.events.length, 6)
}
export function createBuilding(id: number, type: BuildingId, x: number, z: number, complete: boolean): Building {
  const def = BUILDINGS[type]
  return {
    id, type, x, z, complete,
    work: complete ? def.constructionWork : 0,
    health: complete ? def.maxHealth : 0,
    maxHealth: def.maxHealth,
    destroyed: false,
    lastHitTick: 0,
    inventory: emptyInventory(),
    delivered: complete ? { ...def.buildCost } : emptyInventory(),
  }
}
export function createInitialWorldState(): WorldState {
  const state: WorldState = {
    version: 1, nextId: 1, tick: 0, elapsedSeconds: 0, day: 1, timeOfDay: 0.32, topology: 0,
    player: { x: 0, z: 5, health: 100, maxHealth: 100, attackCooldown: 0, lastHitTick: 0 },
    settlers: [], enemies: [], nodes: [], buildings: [], jobs: [],
    targets: { ...DEFAULT_TARGETS }, raid: { ...DEFAULT_RAID },
    totals: {
      gathered: emptyInventory(), deposited: emptyInventory(), delivered: emptyInventory(),
      constructed: 0, repairedHealth: 0, structureDamage: 0,
    },
    events: ['A new camp. Gather wood, then build homes for your settlers.'],
  }
  state.buildings.push(createBuilding(state.nextId++, 'stockpile', 0, 0, true))
  for (let i = 0; i < 60; i++) {
    const row = Math.floor(i / 10), col = i % 10
    state.nodes.push({
      id: state.nextId++, resource: i < 40 ? 'wood' : 'food', remaining: 40,
      x: -19 + col * 4, z: i < 40 ? -19 + row * 3 : 13 + (row - 4) * 4,
    })
  }
  for (let i = 0; i < 6; i++) spawnSettler(state)
  return state
}
