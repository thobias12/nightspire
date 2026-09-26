import { MAP_MAX, MAP_MIN, blockedCells, cellKey, entrance, inBounds } from './Navigation'
import type { Enemy, Point, WorldState } from './WorldState'

export const RAID_SIZE = 12
export const ENEMY_WALK_SPEED = 1.65

const OFFSETS = [-18, -15, -12, -9, -6, -3, 3, 6, 9, 12, 15, 18]

function raidTargetId(state: WorldState): number {
  return (state.buildings.find(b => b.complete && b.type === 'stockpile') ?? state.buildings.find(b => b.complete))!.id
}

function rawSpawn(side: number, offset: number): Point {
  if (side === 0) return { x: offset, z: MAP_MIN + 1 }
  if (side === 1) return { x: MAP_MAX - 1, z: offset }
  if (side === 2) return { x: -offset, z: MAP_MAX - 1 }
  return { x: MAP_MIN + 1, z: -offset }
}

function safeSpawn(state: WorldState, side: number, offset: number): Point {
  const blocked = blockedCells(state)
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
  const targetId = raidTargetId(state)
  const side = state.raid.wave % 4
  const spawned: Enemy[] = OFFSETS.map(offset => {
    const p = safeSpawn(state, side, offset)
    return {
      id: state.nextId++, kind: 'raider' as const, targetId,
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

export function enemyTarget(state: WorldState, enemy: Enemy): Point {
  const target = state.buildings.find(b => b.id === enemy.targetId && b.complete)
    ?? state.buildings.find(b => b.complete && b.type === 'stockpile')
    ?? state.buildings.find(b => b.complete)
  return target ? entrance(target) : { x: 0, z: 2 }
}
