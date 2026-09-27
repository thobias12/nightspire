import { BUILDINGS } from '../data/buildings'
import type { ResourceId } from '../data/resources'
import type { JobReservations } from './JobReservations'
import { workplaceStaffing } from './Workforce'
import type { Building, HaulPriority, WorldState } from './WorldState'

export const HAUL_PRIORITY_ORDER: readonly HaulPriority[] = ['low', 'normal', 'high']

export function nextHaulPriority(priority: HaulPriority): HaulPriority {
  const index = HAUL_PRIORITY_ORDER.indexOf(priority)
  return HAUL_PRIORITY_ORDER[(index + 1) % HAUL_PRIORITY_ORDER.length]
}

export function haulPriorityLabel(priority: HaulPriority): string {
  return priority[0].toUpperCase() + priority.slice(1)
}

export function workplaceInputTarget(building: Building): number {
  const production = BUILDINGS[building.type].production
  if (!production) return 0
  if (building.haulPriority === 'low') return production.inputAmount
  if (building.haulPriority === 'high') return production.inputCapacity
  return Math.min(production.inputCapacity, production.inputBufferTarget)
}

export function workplaceOutputThreshold(building: Building): number {
  const production = BUILDINGS[building.type].production
  if (!production) return Infinity
  if (building.haulPriority === 'high') return production.outputAmount
  if (building.haulPriority === 'low') {
    const delayed = Math.ceil(production.outputCapacity * 0.75 / production.outputAmount) * production.outputAmount
    return Math.min(production.outputCapacity, Math.max(production.outputHaulThreshold, delayed))
  }
  return Math.min(production.outputCapacity, Math.max(production.outputAmount, production.outputHaulThreshold))
}

export function workplaceInputNeed(
  state: WorldState,
  building: Building,
  resource: ResourceId,
  index?: JobReservations,
): number {
  const production = BUILDINGS[building.type].production
  if (!production || production.inputResource !== resource || building.destroyed || !building.complete) return 0
  if (workplaceStaffing(state, building).assigned <= 0) return 0
  const incoming = index
    ? index.supplied(building.id, resource)
    : state.jobs
      .filter(job => job.kind === 'supply' && job.targetId === building.id && job.resource === resource)
      .reduce((sum, job) => sum + job.amount, 0)
  return Math.max(0, workplaceInputTarget(building) - building.inventory[resource] - incoming)
}

export function workplaceOutputReady(
  state: WorldState,
  building: Building,
  index?: JobReservations,
): number {
  const production = BUILDINGS[building.type].production
  if (!production || building.destroyed || !building.complete) return 0
  const reserved = index
    ? index.pickup(building.id, production.outputResource)
    : state.jobs
      .filter(job => job.kind === 'supply' && job.sourceId === building.id && job.resource === production.outputResource && job.stage === 'source')
      .reduce((sum, job) => sum + job.amount, 0)
  const available = Math.max(0, building.inventory[production.outputResource] - reserved)
  return available >= workplaceOutputThreshold(building) ? available : 0
}

export function workplaceHaulScore(building: Building, urgent = false): number {
  const priorityBoost = building.haulPriority === 'high' ? 40 : building.haulPriority === 'low' ? -25 : 10
  return 300 + priorityBoost + (urgent ? 30 : 0)
}
