import { distance } from './Navigation'
import { enemyLabel, recordEvent, settlerLabel, type Enemy, type Point, type Settler, type WorldState } from './WorldState'

export const PLAYER_DAMAGE = 20
export const PLAYER_ATTACK_RANGE = 2.2
export const PLAYER_ATTACK_COOLDOWN = 0.45
export const GUARD_DAMAGE = 10
export const GUARD_ATTACK_RANGE = 1.5
export const GUARD_AGGRO_RANGE = 8
export const GUARD_ATTACK_COOLDOWN = 0.8
export const RAIDER_DAMAGE = 8
export const RAIDER_ATTACK_RANGE = 1.35
export const RAIDER_ATTACK_COOLDOWN = 1.0

export interface AttackResult {
  ok: boolean
  message: string
  targetId?: number
  killed?: boolean
}

export function tickCombatCooldowns(state: WorldState, delta: number): void {
  state.player.attackCooldown = Math.max(0, state.player.attackCooldown - delta)
  for (const settler of state.settlers) settler.attackCooldown = Math.max(0, settler.attackCooldown - delta)
  for (const enemy of state.enemies) enemy.attackCooldown = Math.max(0, enemy.attackCooldown - delta)
}

export function nearestEnemy(state: WorldState, point: Point, range = Infinity): Enemy | null {
  let best: Enemy | null = null, bestDistance = range
  for (const enemy of state.enemies) {
    if (enemy.health <= 0) continue
    const d = distance(point, enemy)
    if (d <= bestDistance) { best = enemy; bestDistance = d }
  }
  return best
}

export function livingGuards(state: WorldState): Settler[] {
  return state.settlers.filter(a => a.role === 'guard' && a.health > 0 && a.jobId === null)
}

export function damageEnemy(state: WorldState, enemy: Enemy, damage: number, source: string): boolean {
  enemy.health = Math.max(0, enemy.health - damage)
  if (enemy.health > 0) return false
  const label = enemyLabel(state, enemy.id)
  const index = state.enemies.findIndex(e => e.id === enemy.id)
  if (index >= 0) state.enemies.splice(index, 1)
  state.raid.totalDefeated++
  recordEvent(state, source + ' defeated ' + label + '.')
  if (state.enemies.length === 0 && state.raid.lastSpawnDay === state.day) {
    state.raid.lastClearedWave = state.raid.wave
    recordEvent(state, 'Raid wave ' + state.raid.wave + ' cleared before dawn.')
  }
  return true
}

export function damageSettler(state: WorldState, settler: Settler, damage: number): boolean {
  settler.health = Math.max(0, settler.health - damage)
  if (settler.health > 0) return false
  settler.path = []; settler.pathRevision = -1; settler.status = 'Downed until dawn'
  recordEvent(state, settlerLabel(state, settler.id) + ' was downed.')
  return true
}

export function damagePlayer(state: WorldState, damage: number): boolean {
  state.player.health = Math.max(0, state.player.health - damage)
  if (state.player.health > 0) return false
  recordEvent(state, 'You were downed. Hold until dawn.')
  return true
}

export function playerAttack(state: WorldState): AttackResult {
  if (state.player.health <= 0) return { ok: false, message: 'You are downed until dawn.' }
  if (state.player.attackCooldown > 0) return { ok: false, message: 'Weapon recovering.' }
  const enemy = nearestEnemy(state, state.player, PLAYER_ATTACK_RANGE)
  if (!enemy) return { ok: false, message: 'No raider in melee range.' }
  state.player.attackCooldown = PLAYER_ATTACK_COOLDOWN
  const id = enemy.id
  const killed = damageEnemy(state, enemy, PLAYER_DAMAGE, 'You')
  return { ok: true, targetId: id, killed, message: killed ? 'Raider defeated.' : 'Hit raider for ' + PLAYER_DAMAGE + ' damage.' }
}

export function restoreAtDawn(state: WorldState): void {
  state.player.health = state.player.maxHealth
  state.player.attackCooldown = 0
  for (const settler of state.settlers) {
    settler.health = settler.maxHealth
    settler.attackCooldown = 0
    if (settler.status === 'Downed until dawn') settler.status = 'Recovering at dawn'
  }
}
