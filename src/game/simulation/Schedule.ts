import { BUILDINGS } from '../data/buildings'
import type { DayPhase } from './DayNight'
import { entrance } from './Navigation'
import { serviceAssignment, type ServiceAssignment } from './Services'
import type { Point, Settler, WorldState } from './WorldState'

export type SettlerRole = 'worker' | 'guard'

export function assignedGuardPost(state: WorldState, settler: Settler): { buildingId: number; slot: number } | null {
  if (settler.role !== 'guard') return null
  const guards = state.settlers.filter(a => a.role === 'guard')
  const guardIndex = guards.findIndex(a => a.id === settler.id)
  if (guardIndex < 0) return null

  const slots = state.buildings
    .filter(b => b.complete && !b.destroyed && BUILDINGS[b.type].guardSlots > 0)
    .flatMap(b => Array.from({ length: BUILDINGS[b.type].guardSlots }, (_, slot) => ({ buildingId: b.id, slot })))
  return slots[guardIndex] ?? null
}

function guardTarget(state: WorldState, settler: Settler): Point | null {
  const assignment = assignedGuardPost(state, settler)
  if (!assignment) return null
  const post = state.buildings.find(b => b.id === assignment.buildingId)
  if (!post) return null
  const door = entrance(post)
  const offset = assignment.slot % 2 === 0 ? -1 : 1
  return { x: door.x + offset, z: door.z }
}

function homeTarget(state: WorldState, settler: Settler): Point {
  const home = state.buildings.find(b => b.id === settler.homeId && b.complete && !b.destroyed)
  if (home) return entrance(home)
  const starter = state.buildings.find(b => b.type === 'stockpile' && b.complete && !b.destroyed) ?? state.buildings.find(b => b.complete && !b.destroyed)
  return starter ? entrance(starter) : { x: 0, z: 2 }
}

export function nightTarget(
  state: WorldState, settler: Settler, phase: DayPhase,
  services?: ReadonlyMap<number, ServiceAssignment>,
): { target: Point; status: string } {
  if (settler.role === 'guard') {
    const target = guardTarget(state, settler)
    if (target) return { target, status: 'Guarding the settlement' }
    return { target: homeTarget(state, settler), status: 'Guard reserve — no post' }
  }

  if (phase !== 'day') {
    const service = services ? services.get(settler.id) : serviceAssignment(state, settler, phase)
    if (service) return { target: service.target, status: 'Visiting ' + service.label }
  }

  return { target: homeTarget(state, settler), status: settler.homeId === null ? 'Sheltering at camp' : 'Sheltering at home' }
}
