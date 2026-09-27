import { BUILDINGS, type BuildingId } from '../data/buildings'
import type { JobKind } from '../data/jobs'
import { emptyInventory, type Inventory, type ResourceId } from '../data/resources'
import type { SettlerRole } from './Schedule'

export interface Point { x: number; z: number }
export interface PlayerState extends Point {
  health: number; maxHealth: number; attackCooldown: number; lastHitTick: number
}
export interface ResourceNode extends Point { id: number; resource: ResourceId; remaining: number }
export interface RoadPath {
  id: number
  points: Point[]
  width: number
}
export type BackyardKind = 'garden' | 'chickens' | 'workyard' | 'firewood'
export interface ResidentialPlot {
  id: number
  buildingId: number
  roadId: number
  frontageA: Point
  frontageB: Point
  depth: number
  side: 1 | -1
  angle: number
  backyard: BackyardKind
}
export type HaulPriority = 'low' | 'normal' | 'high'
export type StockpilePriority = 'low' | 'normal' | 'high'
export type StockpileFilters = Record<ResourceId, boolean>
export interface Building extends Point {
  id: number; type: BuildingId; rotation: number; facingAngle?: number; complete: boolean; work: number; haulPriority: HaulPriority
  stockpilePriority: StockpilePriority; stockpileFilters: StockpileFilters
  health: number; maxHealth: number; destroyed: boolean; lastHitTick: number
  inventory: Inventory; delivered: Inventory; serviceProgress: number; productionProgress: number
  distributionDay: number; distributionServed: number
}
export type NeedId = 'food' | 'housing' | 'safety' | 'recreation'
export type NeedLevels = Record<NeedId, number>
export interface Settler extends Point {
  id: number; homeId: number | null; jobId: number | null; role: SettlerRole; workplaceId: number | null
  health: number; maxHealth: number; attackCooldown: number; lastHitTick: number
  needs: NeedLevels; lastMealDay: number
  arrivalTarget: Point | null
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
export interface ImmigrationState {
  eligibleDays: number
  lastEvaluationDay: number
  lastArrivalDay: number
  totalArrivals: number
}
export interface WorldState {
  version: 1; nextId: number; tick: number; elapsedSeconds: number; day: number; timeOfDay: number
  topology: number; player: PlayerState; settlers: Settler[]; enemies: Enemy[]; nodes: ResourceNode[]; buildings: Building[]; jobs: Job[]
  roads: RoadPath[]; residentialPlots: ResidentialPlot[]
  targets: Inventory; raid: RaidState; immigration: ImmigrationState
  totals: {
    gathered: Inventory; deposited: Inventory; delivered: Inventory; constructed: number
    repairedHealth: number; repairWoodUsed: number; structureDamage: number
    foodConsumed: number; serviceConsumed: Inventory
    productionConsumed: Inventory; produced: Inventory
  }
  events: string[]
}
export const MAX_SETTLERS = 10
export const MAX_ENEMIES = 64
export const DEFAULT_TARGETS: Inventory = { wood: 150, food: 100, ale: 0, ore: 0, tools: 0 }
export const DEFAULT_RAID: RaidState = { lastSpawnDay: 0, wave: 0, totalSpawned: 0, totalDefeated: 0, lastClearedWave: 0 }
export const DEFAULT_IMMIGRATION: ImmigrationState = { eligibleDays: 0, lastEvaluationDay: 0, lastArrivalDay: 0, totalArrivals: 0 }
export const NEED_IDS: NeedId[] = ['food', 'housing', 'safety', 'recreation']
export const DEFAULT_NEEDS: NeedLevels = { food: 90, housing: 70, safety: 65, recreation: 65 }

export function settlerLabel(state: WorldState, id: number): string {
  const index = state.settlers.findIndex(a => a.id === id)
  return index >= 0 ? 'Settler ' + (index + 1) : 'Settler ' + id
}
export function enemyLabel(state: WorldState, id: number): string {
  const index = state.enemies.findIndex(a => a.id === id)
  return index >= 0 ? 'Raider ' + (index + 1) : 'Raider ' + id
}
export function spawnSettler(
  state: WorldState,
  spawn: Point = { x: 0, z: 2 },
  arrivalTarget: Point | null = null,
): boolean {
  if (state.settlers.length >= MAX_SETTLERS) return false
  state.settlers.push({
    id: state.nextId++, x: spawn.x, z: spawn.z, homeId: null, jobId: null, role: 'worker', workplaceId: null,
    health: 100, maxHealth: 100, attackCooldown: 0, lastHitTick: 0,
    needs: { ...DEFAULT_NEEDS }, lastMealDay: state.day,
    arrivalTarget,
    cargo: emptyInventory(), path: [], pathRevision: -1,
    status: arrivalTarget ? 'Arriving in Nightspire' : 'Needs work',
  })
  return true
}
export function recordEvent(state: WorldState, message: string): void {
  state.events.unshift(message)
  state.events.length = Math.min(state.events.length, 6)
}
export function createBuilding(
  id: number,
  type: BuildingId,
  x: number,
  z: number,
  complete: boolean,
  rotation = 0,
): Building {
  const def = BUILDINGS[type]
  return {
    id, type, x, z, rotation: ((Math.round(rotation) % 4) + 4) % 4, complete,
    work: complete ? def.constructionWork : 0, haulPriority: 'normal',
    stockpilePriority: 'normal',
    stockpileFilters: { wood: true, food: true, ale: true, ore: true, tools: true },
    health: complete ? def.maxHealth : 0,
    maxHealth: def.maxHealth,
    destroyed: false,
    lastHitTick: 0,
    inventory: emptyInventory(),
    delivered: complete ? { ...def.buildCost } : emptyInventory(),
    serviceProgress: 0,
    productionProgress: 0,
    distributionDay: 0,
    distributionServed: 0,
  }
}
export function createInitialWorldState(): WorldState {
  const state: WorldState = {
    version: 1, nextId: 1, tick: 0, elapsedSeconds: 0, day: 1, timeOfDay: 0.32, topology: 0,
    player: { x: 0, z: 5, health: 100, maxHealth: 100, attackCooldown: 0, lastHitTick: 0 },
    settlers: [], enemies: [], nodes: [], buildings: [], jobs: [], roads: [], residentialPlots: [],
    targets: { ...DEFAULT_TARGETS }, raid: { ...DEFAULT_RAID }, immigration: { ...DEFAULT_IMMIGRATION },
    totals: {
      gathered: emptyInventory(), deposited: emptyInventory(), delivered: emptyInventory(),
      constructed: 0, repairedHealth: 0, repairWoodUsed: 0, structureDamage: 0,
      foodConsumed: 0, serviceConsumed: emptyInventory(),
      productionConsumed: emptyInventory(), produced: emptyInventory(),
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
  for (let i = 0; i < 12; i++) {
    state.nodes.push({
      id: state.nextId++, resource: 'ore', remaining: 30,
      x: i < 6 ? -20 : 20, z: -10 + (i % 6) * 4,
    })
  }
  for (let i = 0; i < 6; i++) spawnSettler(state)
  for (const settler of state.settlers) settler.lastMealDay = Math.max(0, state.day - 1)
  return state
}
