import { BUILDINGS } from '../data/buildings'
import { nearestFarmhouseForField, pointInPolygon } from './FieldPlanning'
import { distance } from './Navigation'
import { workplaceWorkers } from './Workforce'
import { recordEvent, type Building, type FieldPlot, type Settler, type WorldState } from './WorldState'

export const FIELD_GROWTH_DAYS = 2

export function farmhouseFoodCapacity(building: Building): number {
  return BUILDINGS[building.type].agricultureStorageCapacity ?? 0
}

export function farmhouseFoodFree(building: Building): number {
  return Math.max(0, farmhouseFoodCapacity(building) - building.inventory.food)
}

export function fieldSowWork(field: FieldPlot): number {
  return Math.max(5, field.area * 0.12)
}

export function fieldHarvestWork(field: FieldPlot): number {
  return Math.max(6, field.area * 0.16)
}

export function assignFieldsToFarmhouses(state: WorldState): void {
  const farmhouses = state.buildings
    .filter(building => building.type === 'farmhouse' && building.complete && !building.destroyed)
    .sort((a, b) => a.id - b.id)
  for (const field of state.fields) {
    const current = farmhouses.find(building => building.id === field.farmhouseId)
    if (current && nearestFarmhouseForField(field.points, [current])?.id === current.id) continue
    field.farmhouseId = nearestFarmhouseForField(field.points, farmhouses)?.id ?? null
  }
}

export function fieldsForFarmhouse(state: WorldState, farmhouseId: number): FieldPlot[] {
  assignFieldsToFarmhouses(state)
  return state.fields.filter(field => field.farmhouseId === farmhouseId).sort((a, b) => a.id - b.id)
}

function workPriority(field: FieldPlot): number {
  if (field.phase === 'ready') return 0
  if (field.phase === 'fallow') return 1
  return 2
}

export function farmerFieldAssignment(state: WorldState, farmhouse: Building, farmer: Settler): FieldPlot | null {
  const workable = fieldsForFarmhouse(state, farmhouse.id)
    .filter(field => field.phase === 'ready' || field.phase === 'fallow')
    .sort((a, b) => workPriority(a) - workPriority(b) || a.id - b.id)
  if (workable.length === 0) return null
  const workers = workplaceWorkers(state, farmhouse.id)
  const index = Math.max(0, workers.findIndex(worker => worker.id === farmer.id))
  return workable[index % workable.length]
}

export function fieldWorkPoint(field: FieldPlot): { x: number; z: number } {
  const rounded = { x: Math.round(field.x), z: Math.round(field.z) }
  if (pointInPolygon(rounded, field.points)) return rounded

  const minX = Math.ceil(Math.min(...field.points.map(point => point.x)))
  const maxX = Math.floor(Math.max(...field.points.map(point => point.x)))
  const minZ = Math.ceil(Math.min(...field.points.map(point => point.z)))
  const maxZ = Math.floor(Math.max(...field.points.map(point => point.z)))
  let best: { x: number; z: number } | null = null
  let bestDistance = Infinity
  for (let x = minX; x <= maxX; x++) {
    for (let z = minZ; z <= maxZ; z++) {
      const candidate = { x, z }
      if (!pointInPolygon(candidate, field.points)) continue
      const d = distance(candidate, field)
      if (d < bestDistance) {
        best = candidate
        bestDistance = d
      }
    }
  }
  return best ?? rounded
}

export function agricultureActionLabel(field: FieldPlot): string {
  return field.phase === 'ready' ? 'Harvesting' : field.phase === 'fallow' ? 'Sowing' : 'Tending'
}

export function workField(
  state: WorldState,
  farmhouse: Building,
  field: FieldPlot,
  dt: number,
  workRate: number,
): string {
  if (field.phase === 'fallow') {
    field.work += dt * workRate
    if (field.work >= fieldSowWork(field)) {
      field.phase = 'sown'
      field.work = 0
      field.growthDays = 0
      field.lastGrowthDay = state.day
      recordEvent(state, 'Field ' + field.id + ' was sown. Expected harvest: ' + field.yield + ' Food.')
      return 'Sown field ' + field.id
    }
    return 'Sowing field ' + field.id
  }

  if (field.phase === 'ready') {
    if (farmhouseFoodFree(farmhouse) < field.yield) return 'Farmhouse Food store full'
    field.work += dt * workRate
    if (field.work >= fieldHarvestWork(field)) {
      farmhouse.inventory.food += field.yield
      state.totals.produced.food += field.yield
      field.phase = 'harvested'
      field.work = 0
      field.growthDays = 0
      field.lastGrowthDay = state.day
      recordEvent(state, 'Field ' + field.id + ' harvested ' + field.yield + ' Food into Farmhouse ' + farmhouse.id + '.')
      return 'Harvested field ' + field.id
    }
    return 'Harvesting field ' + field.id
  }

  return 'Waiting on crops'
}

export function processAgricultureDay(state: WorldState): void {
  assignFieldsToFarmhouses(state)
  for (const field of state.fields) {
    if (field.lastGrowthDay === state.day) continue
    if (field.phase === 'harvested') {
      field.phase = 'fallow'
      field.work = 0
      field.lastGrowthDay = state.day
      continue
    }
    if (field.phase === 'sown') {
      field.phase = 'growing'
      field.growthDays = 1
      field.lastGrowthDay = state.day
      continue
    }
    if (field.phase === 'growing') {
      field.growthDays++
      field.lastGrowthDay = state.day
      if (field.growthDays >= FIELD_GROWTH_DAYS) {
        field.phase = 'ready'
        field.work = 0
        recordEvent(state, 'Field ' + field.id + ' is ready to harvest.')
      }
    }
  }
}

export function agricultureSummary(state: WorldState) {
  assignFieldsToFarmhouses(state)
  const phases = { fallow: 0, sown: 0, growing: 0, ready: 0, harvested: 0 }
  for (const field of state.fields) phases[field.phase]++
  const farmFood = state.buildings
    .filter(building => building.type === 'farmhouse' && building.complete && !building.destroyed)
    .reduce((sum, building) => sum + building.inventory.food, 0)
  const expected = state.fields.filter(field => field.phase === 'ready' || field.phase === 'growing' || field.phase === 'sown')
    .reduce((sum, field) => sum + field.yield, 0)
  return { fields: state.fields.length, phases, farmFood, expected }
}

export function clearInvalidFieldAssignments(state: WorldState): void {
  const ids = new Set(state.buildings.filter(building => building.type === 'farmhouse' && building.complete && !building.destroyed).map(building => building.id))
  for (const field of state.fields) if (field.farmhouseId !== null && !ids.has(field.farmhouseId)) field.farmhouseId = null
  assignFieldsToFarmhouses(state)
}
