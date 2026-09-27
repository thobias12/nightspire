import { BUILDINGS } from '../data/buildings'
import {
  MAP_MAX, MAP_MIN, blockedCells, cellKey, closestInteractionPoint,
  distance, inBounds,
} from './Navigation'
import type { Building, Enemy, Point, WorldState } from './WorldState'

export const RAID_SIZE = 20
export const RAID_GROWTH = 4
export const RAID_MAX_SIZE = 40
export const ENEMY_WALK_SPEED = 1.65

export type RaiderArchetype = 'skirmisher' | 'raider' | 'brute'

export interface RaiderProfile {
  archetype: RaiderArchetype
  label: string
  maxHealth: number
  walkSpeed: number
  damage: number
  structureDamage: number
  attackRange: number
  attackCooldown: number
  defenderAggroRange: number
}

export const RAIDER_PROFILES: Record<RaiderArchetype, RaiderProfile> = {
  skirmisher: {
    archetype: 'skirmisher',
    label: 'Skirmisher',
    maxHealth: 28,
    walkSpeed: 2.15,
    damage: 6,
    structureDamage: 7,
    attackRange: 1.25,
    attackCooldown: 0.72,
    defenderAggroRange: 7,
  },
  raider: {
    archetype: 'raider',
    label: 'Raider',
    maxHealth: 40,
    walkSpeed: ENEMY_WALK_SPEED,
    damage: 8,
    structureDamage: 12,
    attackRange: 1.35,
    attackCooldown: 1,
    defenderAggroRange: 5.5,
  },
  brute: {
    archetype: 'brute',
    label: 'Brute',
    maxHealth: 72,
    walkSpeed: 1.15,
    damage: 14,
    structureDamage: 22,
    attackRange: 1.5,
    attackCooldown: 1.2,
    defenderAggroRange: 4.5,
  },
}

export interface RaidPlan {
  wave: number
  size: number
  fronts: number
  skirmishers: number
  raiders: number
  brutes: number
}

export function raidSizeForWave(wave: number): number {
  const safeWave = Math.max(1, Math.floor(wave))
  return Math.min(RAID_MAX_SIZE, RAID_SIZE + (safeWave - 1) * RAID_GROWTH)
}

export function raidFrontCountForWave(wave: number): number {
  return Math.max(1, Math.floor(wave)) === 1 ? 1 : 2
}

export function raidArchetypeForSpawn(wave: number, index: number): RaiderArchetype {
  const safeWave = Math.max(1, Math.floor(wave))
  if (safeWave >= 2 && (index + safeWave * 2) % 9 === 0) return 'brute'
  if ((index + safeWave) % 4 === 0) return 'skirmisher'
  return 'raider'
}

export function raidPlanForWave(wave: number): RaidPlan {
  const safeWave = Math.max(1, Math.floor(wave))
  const size = raidSizeForWave(safeWave)
  let skirmishers = 0, raiders = 0, brutes = 0
  for (let index = 0; index < size; index++) {
    const archetype = raidArchetypeForSpawn(safeWave, index)
    if (archetype === 'skirmisher') skirmishers++
    else if (archetype === 'brute') brutes++
    else raiders++
  }
  return { wave: safeWave, size, fronts: raidFrontCountForWave(safeWave), skirmishers, raiders, brutes }
}

/**
 * Archetype is encoded by max health so combat remains compatible with the
 * existing serialized Enemy shape. Old 40-HP raiders naturally remain raiders.
 */
export function raiderArchetype(enemy: Pick<Enemy, 'maxHealth'>): RaiderArchetype {
  if (enemy.maxHealth >= RAIDER_PROFILES.brute.maxHealth) return 'brute'
  if (enemy.maxHealth <= RAIDER_PROFILES.skirmisher.maxHealth) return 'skirmisher'
  return 'raider'
}

export function raiderProfile(enemy: Pick<Enemy, 'maxHealth'>): RaiderProfile {
  return RAIDER_PROFILES[raiderArchetype(enemy)]
}

function offsetsForCount(count: number): number[] {
  if (count <= 1) return [0]
  const minimum = -18
  const maximum = 18
  const step = (maximum - minimum) / (count - 1)
  return Array.from({ length: count }, (_, index) => minimum + step * index)
}

function initialTargetId(state: WorldState): number {
  return (
    state.buildings.find(b => b.complete && !b.destroyed && b.type === 'stockpile')
    ?? state.buildings.find(b => b.complete && !b.destroyed)
  )!.id
}

function rawSpawn(side: number, offset: number): Point {
  if (side === 0) return { x: offset, z: MAP_MIN + 1 }
  if (side === 1) return { x: MAP_MAX - 1, z: offset }
  if (side === 2) return { x: -offset, z: MAP_MAX - 1 }
  return { x: MAP_MIN + 1, z: -offset }
}

function safeSpawn(state: WorldState, side: number, offset: number): Point {
  const blocked = blockedCells(state, true)
  const start = rawSpawn(side, offset)
  if (inBounds(start) && !blocked.has(cellKey(start))) return start

  for (let inward = 1; inward <= 5; inward++) {
    const candidate = side === 0 ? { x: start.x, z: start.z + inward }
      : side === 1 ? { x: start.x - inward, z: start.z }
      : side === 2 ? { x: start.x, z: start.z - inward }
      : { x: start.x + inward, z: start.z }
    if (inBounds(candidate) && !blocked.has(cellKey(candidate))) return candidate
  }
  return start
}

function spawnSides(wave: number, baseSide: number): number[] {
  if (raidFrontCountForWave(wave) === 1) return [baseSide]
  return [baseSide, (baseSide + 2) % 4]
}

export function spawnNightRaid(state: WorldState): number {
  if (state.enemies.length > 0 || state.raid.lastSpawnDay === state.day) return 0
  const targetId = initialTargetId(state)
  const waveNumber = state.raid.wave + 1
  const size = raidSizeForWave(waveNumber)
  const sides = spawnSides(waveNumber, state.raid.wave % 4)
  const perFront = sides.map((_, index) => Math.floor(size / sides.length) + (index < size % sides.length ? 1 : 0))

  const spawned: Enemy[] = []
  let spawnIndex = 0
  for (let front = 0; front < sides.length; front++) {
    for (const offset of offsetsForCount(perFront[front])) {
      const archetype = raidArchetypeForSpawn(waveNumber, spawnIndex++)
      const profile = RAIDER_PROFILES[archetype]
      const p = safeSpawn(state, sides[front], offset)
      spawned.push({
        id: state.nextId++, kind: 'raider', targetId,
        health: profile.maxHealth, maxHealth: profile.maxHealth, attackCooldown: 0, lastHitTick: 0,
        x: p.x, z: p.z, path: [], pathRevision: -1,
        status: profile.label + ' entering from the wilds',
      })
    }
  }

  state.enemies.push(...spawned)
  state.raid.lastSpawnDay = state.day
  state.raid.wave++
  state.raid.totalSpawned += spawned.length
  return spawned.length
}

export function retreatRaid(state: WorldState): number {
  const count = state.enemies.length
  state.enemies = []
  return count
}

function targetBias(enemy: Enemy, building: Building): number {
  const archetype = raiderArchetype(enemy)
  if (archetype === 'brute') {
    if (building.type === 'wood-gate') return -8
    if (BUILDINGS[building.type].fortification) return -6
    if (building.type === 'guard-post') return -1
    return 1
  }
  if (archetype === 'skirmisher') {
    if (building.type === 'guard-post') return -4
    if (building.type === 'house') return -1.25
    if (BUILDINGS[building.type].fortification) return 0.75
    return 0
  }
  if (building.type === 'stockpile') return -1.5
  if (building.type === 'guard-post') return -0.75
  if (BUILDINGS[building.type].fortification) return -0.5
  return 0
}

export function enemyTargetBuilding(state: WorldState, enemy: Enemy): Building | null {
  const candidates = state.buildings.filter(b => {
    if (!b.complete || b.destroyed) return false
    const def = BUILDINGS[b.type]
    return def.fortification ? b.health > 0 : b.health > 1
  })
  if (candidates.length === 0) return null

  candidates.sort((a, b) => {
    const da = distance(enemy, a) + targetBias(enemy, a)
    const db = distance(enemy, b) + targetBias(enemy, b)
    return da - db || a.id - b.id
  })

  const target = candidates[0]
  enemy.targetId = target.id
  return target
}

export function enemyTarget(state: WorldState, enemy: Enemy): Point {
  const target = enemyTargetBuilding(state, enemy)
  if (!target) return { x: 0, z: 2 }
  return closestInteractionPoint(target, enemy, blockedCells(state, true))
}
