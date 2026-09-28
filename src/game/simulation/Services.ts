import { worldHalf } from './MapGenerator'
import { BUILDINGS, type ServiceNeedId } from '../data/buildings'
import type { DayPhase } from './DayNight'
import { blockedCells, cellKey, distance, inBounds } from './Navigation'
import type { Building, Point, Settler, WorldState } from './WorldState'
import { workplaceStaffing } from './Workforce'

export const SERVICE_COVERAGE_RADIUS = 18

export interface ServiceAssignment {
  buildingId: number
  slot: number
  target: Point
  need: ServiceNeedId
  gainPerSecond: number
  label: string
}

export interface ServiceSummary {
  providers: number
  slots: number
  activeVisitors: number
  suppliedProviders: number
}

const clamp = (value: number): number => Math.max(0, Math.min(100, value))

function perimeterPoints(building: Building): Point[] {
  const half = Math.floor(BUILDINGS[building.type].footprint / 2)
  const radius = half + 1
  const points: Point[] = []

  for (let x = -radius; x <= radius; x++) {
    points.push({ x: building.x + x, z: building.z - radius })
    points.push({ x: building.x + x, z: building.z + radius })
  }
  for (let z = -radius + 1; z <= radius - 1; z++) {
    points.push({ x: building.x - radius, z: building.z + z })
    points.push({ x: building.x + radius, z: building.z + z })
  }
  return points
}

export function serviceAvailable(building: Building, state?: WorldState): boolean {
  const def = BUILDINGS[building.type]
  const service = def.service
  if (!service || !building.complete || building.destroyed) return false
  if (state && (def.workerSlots ?? 0) > 0 && workplaceStaffing(state, building).active <= 0) return false
  if (service.supplyResource === null) return true
  return building.inventory[service.supplyResource] > 0
}

export function serviceAssignments(
  state: WorldState,
  phase: DayPhase,
  need: ServiceNeedId = 'recreation',
): Map<number, ServiceAssignment> {
  const assignments = new Map<number, ServiceAssignment>()
  if (phase === 'day' || (phase === 'night' && state.enemies.length > 0)) return assignments

  const blocked = blockedCells(state, false)
  const providers = state.buildings
    .filter(building => {
      const service = BUILDINGS[building.type].service
      return serviceAvailable(building, state) && service?.need === need && service.activePhases.includes(phase)
    })
    .sort((a, b) => {
      const sa = BUILDINGS[a.type].service!
      const sb = BUILDINGS[b.type].service!
      return sb.priority - sa.priority || a.id - b.id
    })

  const slots = providers.flatMap(building => {
    const service = BUILDINGS[building.type].service!
    return perimeterPoints(building)
      .filter(point => inBounds(point, worldHalf(state)) && !blocked.has(cellKey(point)))
      .slice(0, service.slots)
      .map((target, slot) => ({
        building,
        service,
        slot,
        target,
      }))
  })

  const settlers = state.settlers
    .filter(settler => settler.role !== 'guard' && settler.health > 0)
    .sort((a, b) => a.id - b.id)
  const availableSlots = [...slots]

  for (const settler of settlers) {
    const home = settler.homeId === null ? null : state.buildings.find(building => building.id === settler.homeId)
    const origin = home ?? settler
    const eligible = availableSlots
      .map((slot, index) => ({ slot, index }))
      .filter(({ slot }) => distance(origin, slot.building) <= SERVICE_COVERAGE_RADIUS)
      .sort((a, b) =>
        b.slot.service.priority - a.slot.service.priority
        || distance(origin, a.slot.building) - distance(origin, b.slot.building)
        || a.slot.building.id - b.slot.building.id
        || a.slot.slot - b.slot.slot
      )
    const chosen = eligible[0]
    if (!chosen) continue
    const [slot] = availableSlots.splice(chosen.index, 1)
    assignments.set(settler.id, {
      buildingId: slot.building.id,
      slot: slot.slot,
      target: slot.target,
      need,
      gainPerSecond: slot.service.gainPerSecond,
      label: BUILDINGS[slot.building.type].label,
    })
  }

  return assignments
}

export function serviceAssignment(
  state: WorldState,
  settler: Settler,
  phase: DayPhase,
  need: ServiceNeedId = 'recreation',
): ServiceAssignment | null {
  return serviceAssignments(state, phase, need).get(settler.id) ?? null
}

export function updateServices(state: WorldState, delta: number, phase: DayPhase): void {
  const assignments = serviceAssignments(state, phase)
  const activeByBuilding = new Map<number, number>()

  for (const settler of state.settlers) {
    const assignment = assignments.get(settler.id)
    if (!assignment || distance(settler, assignment.target) >= 0.2) continue
    settler.needs[assignment.need] = clamp(settler.needs[assignment.need] + assignment.gainPerSecond * delta)
    activeByBuilding.set(assignment.buildingId, (activeByBuilding.get(assignment.buildingId) ?? 0) + 1)
  }

  for (const building of state.buildings) {
    const service = BUILDINGS[building.type].service
    if (!service || service.supplyResource === null) {
      building.serviceProgress = 0
      continue
    }

    const visitors = activeByBuilding.get(building.id) ?? 0
    if (!serviceAvailable(building, state) || visitors === 0 || !service.activePhases.includes(phase)) {
      if (visitors === 0) building.serviceProgress = 0
      continue
    }

    building.serviceProgress += delta
    while (
      building.serviceProgress + 1e-8 >= service.supplySecondsPerUnit
      && building.inventory[service.supplyResource] > 0
    ) {
      building.serviceProgress -= service.supplySecondsPerUnit
      building.inventory[service.supplyResource]--
      state.totals.serviceConsumed[service.supplyResource]++
    }
    if (building.inventory[service.supplyResource] <= 0) building.serviceProgress = 0
  }
}

export function serviceSummary(state: WorldState, phase: DayPhase): ServiceSummary {
  const providers = state.buildings.filter(building =>
    !!BUILDINGS[building.type].service && building.complete && !building.destroyed,
  )
  const assignments = serviceAssignments(state, phase)
  let activeVisitors = 0
  for (const settler of state.settlers) {
    const assignment = assignments.get(settler.id)
    if (assignment && distance(settler, assignment.target) < 0.2) activeVisitors++
  }
  const blocked = blockedCells(state, false)
  const slots = providers.reduce((sum, building) => {
    const service = BUILDINGS[building.type].service!
    const usable = perimeterPoints(building)
      .filter(point => inBounds(point, worldHalf(state)) && !blocked.has(cellKey(point)))
      .slice(0, service.slots)
      .length
    return sum + usable
  }, 0)
  return {
    providers: providers.length,
    slots,
    activeVisitors,
    suppliedProviders: providers.filter(building => serviceAvailable(building, state)).length,
  }
}
