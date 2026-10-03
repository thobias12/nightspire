import { worldHalf } from '../../world/MapGenerator'
import { terrainBlocked } from '../../world/MapTerrain'
import { BUILDINGS } from '../../data/buildings'
import {
  blockedCells, cellKey, closestInteractionPoint,
  distance, inBounds,
} from '../../world/Navigation'
import type { Building, Enemy, Point, WorldState } from '../../model/WorldState'

export const RAID_SIZE = 20
export const RAID_GROWTH = 4
export const RAID_MAX_SIZE = 40
export const ENEMY_WALK_SPEED = 1.65

export function raidSizeForWave(wave: number): number {
  const safeWave = Math.max(1, Math.floor(wave))
  return Math.min(RAID_MAX_SIZE, RAID_SIZE + (safeWave - 1) * RAID_GROWTH)
}

function offsetsForCount(count: number): number[] {
  if (count <= 1) return [0]
  const minimum = -20
  const maximum = 20
  const step = (maximum - minimum) / (count - 1)
  return Array.from({ length: count }, (_, index) => minimum + step * index)
}

function initialTargetId(state: WorldState): number {
  return (
    state.buildings.find(b => b.complete && !b.destroyed && b.type === 'stockpile')
    ?? state.buildings.find(b => b.complete && !b.destroyed)
  )!.id
}

function rawSpawn(state: WorldState, side: number, offset: number): Point {
  // Keep the existing opening approach time. Distant region edges otherwise
  // make raids retreat at dawn before reaching any settlement.
  const half = worldHalf(state), margin = 22
  let anchor: Point = { x: 0, z: 0 }, edge = 0
  for (const b of state.buildings) {
    if (b.destroyed || !state.map) continue
    const radius = Math.floor(BUILDINGS[b.type].footprint / 2)
    const extent = (side === 0 ? -b.z : side === 1 ? b.x : side === 2 ? b.z : -b.x) + radius
    if (extent > edge) { edge = extent; anchor = b }
  }
  const clamp = (v: number) => Math.max(-half + 1, Math.min(half - 1, v))
  if (side === 0) return { x: clamp(anchor.x + offset), z: clamp(-edge - margin) }
  if (side === 1) return { x: clamp(edge + margin), z: clamp(anchor.z + offset) }
  if (side === 2) return { x: clamp(anchor.x - offset), z: clamp(edge + margin) }
  return { x: clamp(-edge - margin), z: clamp(anchor.z - offset) }
}

function safeSpawn(state: WorldState, side: number, offset: number): Point {
  const blocked = blockedCells(state, true)
  const start = rawSpawn(state, side, offset)
  if (inBounds(start, worldHalf(state)) && !blocked.has(cellKey(start))) return start

  for (let inward = 1; inward <= 5; inward++) {
    const candidate = side === 0 ? { x: start.x, z: start.z + inward }
      : side === 1 ? { x: start.x - inward, z: start.z }
      : side === 2 ? { x: start.x, z: start.z - inward }
      : { x: start.x + inward, z: start.z }
    if (inBounds(candidate, worldHalf(state)) && !blocked.has(cellKey(candidate))) return candidate
  }
  if (terrainBlocked(state.map).has(cellKey(start))) {
    // New water layouts can put the usual approach point inside a lake/river.
    // Find a dry bank without changing legacy raid approaches or wave rules.
    for (let radius=1;radius<=64;radius++) for(const [dx,dz] of [[radius,0],[-radius,0],[0,radius],[0,-radius]]) {
      const candidate={x:start.x+dx,z:start.z+dz}
      if(inBounds(candidate,worldHalf(state))&&!blocked.has(cellKey(candidate)))return candidate
    }
  }
  return start
}

export function spawnNightRaid(state: WorldState): number {
  if (state.enemies.length > 0 || state.raid.lastSpawnDay === state.day) return 0
  const targetId = initialTargetId(state)
  const waveNumber = state.raid.wave + 1
  const side = state.raid.wave % 4
  const size = raidSizeForWave(waveNumber)

  const spawned: Enemy[] = offsetsForCount(size).map(offset => {
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
  const candidates = state.buildings.filter(b => {
    if (!b.complete || b.destroyed) return false
    const def = BUILDINGS[b.type]
    return def.fortification ? b.health > 0 : b.health > 1
  })
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
  return closestInteractionPoint(target, enemy, blockedCells(state, true), worldHalf(state))
}
