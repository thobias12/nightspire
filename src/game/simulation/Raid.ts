import { BUILDINGS } from '../data/buildings'
import {
  MAP_MAX, MAP_MIN, blockedCells, cellKey, closestInteractionPoint,
  distance, inBounds,
} from './Navigation'
import type { Building, Enemy, Point, WorldState } from './WorldState'

export const RAID_SIZE = 12
export const ENEMY_WALK_SPEED = 1.65

const OFFSETS = [-18, -15, -12, -9, -6, -3, 3, 6, 9, 12, 15, 18]

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

export function spawnNightRaid(state: WorldState): number {
  if (state.enemies.length > 0 || state.raid.lastSpawnDay === state.day) return 0
  const targetId = initialTargetId(state)
  const side = state.raid.wave % 4

  const spawned: Enemy[] = OFFSETS.map(offset => {
    const p = safeSpawn(state, side, offset)
    return {
      id: state.nextId++, kind: 'raider' as const, targetId,
      health: 40, maxHealth: 40, attackCooldown: 0, lastHitTick: 0,
      x: p.x, z: p.z, path: [], pathRevision: -1,
      status: 'Entering from the wilds',
    }
  })

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

export function enemyTargetBuilding(state: WorldState, enemy: Enemy): Building | null {
  const candidates = state.buildings.filter(b => b.complete && !b.destroyed)
  if (candidates.length === 0) return null

  candidates.sort((a, b) => {
    const da = distance(enemy, a) - (BUILDINGS[a.type].fortification ? 0.75 : 0)
    const db = distance(enemy, b) - (BUILDINGS[b.type].fortification ? 0.75 : 0)
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
