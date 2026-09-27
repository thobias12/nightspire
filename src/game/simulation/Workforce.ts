import { BUILDINGS } from '../data/buildings'
import { distance, entrance } from './Navigation'
import { recordEvent, settlerLabel, type Building, type Settler, type WorldState } from './WorldState'

export interface WorkplaceStaffing {
  slots: number
  assigned: number
  active: number
  efficiency: number
  workers: Settler[]
}

export interface WorkforceResult {
  ok: boolean
  message: string
  settlerId?: number
}

export const workplaceSlots = (building: Building): number => BUILDINGS[building.type].workerSlots ?? 0

export function assignedWorkplace(state: WorldState, settler: Settler): Building | null {
  if (settler.workplaceId === null) return null
  return state.buildings.find(building => building.id === settler.workplaceId) ?? null
}

export function activeWorkplace(state: WorldState, settler: Settler): Building | null {
  if (settler.role !== 'worker' || settler.workplaceId === null) return null
  const building = assignedWorkplace(state, settler)
  if (!building || !building.complete || building.destroyed || workplaceSlots(building) <= 0) return null
  return building
}

export function workplaceWorkers(state: WorldState, buildingId: number): Settler[] {
  return state.settlers
    .filter(settler => settler.role === 'worker' && settler.workplaceId === buildingId)
    .sort((a, b) => a.id - b.id)
}

export function workplaceTarget(building: Building) {
  return entrance(building)
}

export function workplaceStaffing(state: WorldState, building: Building): WorkplaceStaffing {
  const slots = workplaceSlots(building)
  const workers = workplaceWorkers(state, building.id)
  const target = workplaceTarget(building)
  const active = building.complete && !building.destroyed
    ? workers.filter(settler =>
        settler.health > 0
        && settler.arrivalTarget === null
        && settler.jobId === null
        && (
          distance(settler, target) < 0.2
          || (building.type === 'farmhouse' && (
            settler.status.includes('field')
            || settler.status === 'Farmhouse Food store full'
          ))
        )
      ).length
    : 0
  return {
    slots,
    assigned: workers.length,
    active,
    efficiency: slots > 0 ? Math.min(1, active / slots) : 1,
    workers,
  }
}

export function assignWorkerToWorkplace(
  state: WorldState,
  buildingId: number,
  settlerId?: number,
): WorkforceResult {
  const building = state.buildings.find(candidate => candidate.id === buildingId)
  if (!building || !building.complete || building.destroyed) {
    return { ok: false, message: 'Select a completed, usable workplace first.' }
  }

  const slots = workplaceSlots(building)
  if (slots <= 0) return { ok: false, message: BUILDINGS[building.type].label + ' has no dedicated worker slots.' }

  const assigned = workplaceWorkers(state, building.id)
  if (assigned.length >= slots) return { ok: false, message: BUILDINGS[building.type].label + ' is fully staffed.' }

  const eligible = state.settlers
    .filter(settler =>
      settler.role === 'worker'
      && settler.workplaceId === null
      && settler.arrivalTarget === null
      && settler.health > 0
      && (settlerId === undefined || settler.id === settlerId)
    )
    .sort((a, b) => a.id - b.id)
  const settler = eligible[0]
  if (!settler) return { ok: false, message: 'No available laborer can be assigned.' }

  settler.workplaceId = building.id
  if (settler.jobId === null) {
    settler.path = []
    settler.pathRevision = -1
    settler.status = 'Assigned to ' + BUILDINGS[building.type].label
  }

  const profession = BUILDINGS[building.type].profession ?? 'Worker'
  const suffix = settler.jobId === null ? ' and will report now.' : ' and will report after the current task.'
  const message = settlerLabel(state, settler.id) + ' assigned as ' + profession + suffix
  recordEvent(state, message)
  return { ok: true, message, settlerId: settler.id }
}

export function unassignWorkerFromWorkplace(state: WorldState, settlerId: number): WorkforceResult {
  const settler = state.settlers.find(candidate => candidate.id === settlerId)
  if (!settler || settler.workplaceId === null) return { ok: false, message: 'Settler has no workplace assignment.' }

  const building = assignedWorkplace(state, settler)
  const label = building ? BUILDINGS[building.type].label : 'workplace'
  settler.workplaceId = null
  if (settler.jobId === null) {
    settler.path = []
    settler.pathRevision = -1
    settler.status = 'Needs work'
  }
  const message = settlerLabel(state, settler.id) + ' left ' + label + ' and returned to the labor pool.'
  recordEvent(state, message)
  return { ok: true, message, settlerId: settler.id }
}

export function professionLabel(state: WorldState, settler: Settler): string {
  if (settler.role === 'guard') return 'Guard'

  const workplace = assignedWorkplace(state, settler)
  if (workplace && (BUILDINGS[workplace.type].workerSlots ?? 0) > 0) {
    return BUILDINGS[workplace.type].profession ?? 'Worker'
  }

  const job = settler.jobId === null ? null : state.jobs.find(candidate => candidate.id === settler.jobId)
  if (!job) return 'Laborer'
  if (job.kind === 'construct' || job.kind === 'repair') return 'Builder'
  if (job.kind === 'deliver' || job.kind === 'supply') return 'Hauler'
  if (job.kind === 'gather') {
    if (job.resource === 'wood') return 'Woodcutter'
    if (job.resource === 'food') return 'Forager'
    if (job.resource === 'ore') return 'Miner'
  }
  return 'Laborer'
}
