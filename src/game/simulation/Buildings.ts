import { BUILDINGS, type BuildingId } from '../data/buildings'
import { emptyInventory, RESOURCE_IDS, type ResourceId } from '../data/resources'
import { blockedCells, cellKey, distance, entrance, flood, footprint, inBounds, occupiedCells } from './Navigation'
import { createBuilding, recordEvent, type Building, type Point, type WorldState } from './WorldState'
import { compareStockpileDestinations, stockpileAccepts } from './StockpileLogistics'
import type { JobReservations } from './JobReservations'

export const stockpiles = (s: WorldState): Building[] =>
  s.buildings.filter(b => b.complete && !b.destroyed && BUILDINGS[b.type].storage > 0)

export const reserved = (s: WorldState, id: number, resource: ResourceId): number =>
  s.jobs
    .filter(j => (j.kind === 'deliver' || j.kind === 'repair' || j.kind === 'supply') && j.sourceId === id && j.stage === 'source' && j.resource === resource)
    .reduce((n, j) => n + j.amount, 0)

export const available = (s: WorldState, b: Building, resource: ResourceId, index?: JobReservations): number =>
  b.inventory[resource] - (index ? index.pickup(b.id, resource) : reserved(s, b.id, resource))

export function freeStorage(s: WorldState, b: Building, index?: JobReservations): number {
  const incoming = index ? index.incoming(b.id) : s.jobs
    .filter(j => (j.kind === 'gather' || j.kind === 'supply') && j.targetId === b.id)
    .reduce((n, j) => n + j.amount, 0)
  const used = RESOURCE_IDS.reduce((sum, resource) => sum + b.inventory[resource], 0)
  return BUILDINGS[b.type].storage - used - incoming
}

export function supplyCapacity(b: Building, resource: ResourceId): number {
  const def = BUILDINGS[b.type]
  const service = def.service?.supplyResource === resource ? def.service.supplyCapacity : 0
  const production = def.production?.inputResource === resource ? def.production.inputCapacity : 0
  return Math.max(service, production)
}

export function resourceCapacity(b: Building, resource: ResourceId): number {
  const def = BUILDINGS[b.type]
  if (def.storage > 0) return def.storage
  const supply = supplyCapacity(b, resource)
  const output = def.production?.outputResource === resource ? def.production.outputCapacity : 0
  return Math.max(supply, output)
}

export function supplyFree(state: WorldState, b: Building, resource: ResourceId, index?: JobReservations): number {
  const incoming = index ? index.supplied(b.id, resource) : state.jobs
    .filter(j => j.kind === 'supply' && j.targetId === b.id && j.resource === resource)
    .reduce((sum, job) => sum + job.amount, 0)
  return Math.max(0, supplyCapacity(b, resource) - b.inventory[resource] - incoming)
}

function wallAt(s: WorldState, p: Point): Building | undefined {
  return s.buildings.find(b => b.x === p.x && b.z === p.z && b.type === 'wood-wall' && !b.destroyed)
}

export function placementError(s: WorldState, type: BuildingId, p: Point): string | null {
  if (!Number.isInteger(p.x) || !Number.isInteger(p.z)) return 'Place on the grid.'

  if (type === 'wood-gate') {
    const wall = wallAt(s, p)
    if (wall) {
      if (s.jobs.some(job => job.sourceId === wall.id || job.targetId === wall.id)) return 'Wait for the current wall task to finish before inserting a gate.'
      return null
    }
  }

  if (s.buildings.length >= 120) return 'Building limit reached (120).'

  const cells = footprint({ ...p, type })
  if (cells.some(c => !inBounds(c))) return 'Outside the camp boundary.'

  const occupied = occupiedCells(s)
  if (cells.some(c => occupied.has(cellKey(c)))) return 'Overlaps a building or ruin.'

  const proposed = new Set(cells.map(cellKey))
  if (s.nodes.some(n => n.remaining > 0 && proposed.has(cellKey(n)))) return 'Clear the resources first.'
  if ([s.player, ...s.settlers, ...s.enemies].some(a => cells.some(c => distance(a, c) < 1.05))) return 'Someone is standing here.'

  const friendlyBlocked = blockedCells(s, false)
  if (!BUILDINGS[type].friendlyPassable) for (const c of cells) friendlyBlocked.add(cellKey(c))
  const reachable = flood({ x: 0, z: 2 }, friendlyBlocked)
  const interaction = { x: p.x, z: p.z + Math.floor(BUILDINGS[type].footprint / 2) + 1 }
  const required = [
    ...s.buildings.filter(b => !b.destroyed).map(entrance),
    interaction, s.player, ...s.settlers, ...s.nodes.filter(n => n.remaining > 0),
  ]
  if (required.some(a => !reachable.has(cellKey(a)))) return 'Keep friendly routes connected; use a gate in closed walls.'
  return null
}

export function placeBuilding(s: WorldState, type: BuildingId, p: Point, rotation = 0): string | null {
  const error = placementError(s, type, p)
  if (error) return error

  if (type === 'wood-gate') {
    const wall = wallAt(s, p)
    if (wall) {
      const gate = BUILDINGS['wood-gate']
      wall.type = 'wood-gate'
      wall.rotation = ((Math.round(rotation) % 4) + 4) % 4
      wall.complete = false
      wall.work = 0
      wall.health = 0
      wall.maxHealth = gate.maxHealth
      wall.destroyed = false
      wall.lastHitTick = 0
      const retainedWood = Math.min(wall.delivered.wood, gate.buildCost.wood)
      for (const resource of RESOURCE_IDS) wall.delivered[resource] = 0
      wall.delivered.wood = retainedWood
      wall.serviceProgress = 0
      wall.productionProgress = 0
      s.topology++
      recordEvent(s, 'Wooden Wall converted to a Wooden Gate blueprint; existing timber was retained.')
      return null
    }
  }

  const building = createBuilding(s.nextId++, type, p.x, p.z, false, rotation)
  s.buildings.push(building)
  s.topology++
  recordEvent(s, BUILDINGS[type].label + ' planned. Settlers will deliver materials.')
  return null
}

export function wallLinePoints(start: Point, end: Point): Point[] {
  const dx = end.x - start.x
  const dz = end.z - start.z
  const horizontal = Math.abs(dx) >= Math.abs(dz)
  const steps = Math.abs(horizontal ? dx : dz)
  const direction = Math.sign(horizontal ? dx : dz)
  const points: Point[] = []
  for (let i = 0; i <= steps; i++) {
    points.push(horizontal
      ? { x: start.x + direction * i, z: start.z }
      : { x: start.x, z: start.z + direction * i })
  }
  return points.length ? points : [{ ...start }]
}

export function placementBatchError(
  s: WorldState,
  type: BuildingId,
  points: Point[],
  rotation = 0,
): string | null {
  if (points.length === 0) return 'Drag across at least one grid cell.'
  if (type !== 'wood-wall') return 'Drag placement is currently available for Wooden Walls.'

  const unique = points.filter((point, index) =>
    points.findIndex(candidate => candidate.x === point.x && candidate.z === point.z) === index,
  )
  const staged: WorldState = { ...s, buildings: [...s.buildings] }
  for (let i = 0; i < unique.length; i++) {
    const point = unique[i]
    const error = placementError(staged, type, point)
    if (error) return 'Wall segment ' + (i + 1) + ': ' + error
    staged.buildings.push(createBuilding(staged.nextId + i, type, point.x, point.z, false, rotation))
  }
  return null
}

export function placeBuildingBatch(
  s: WorldState,
  type: BuildingId,
  points: Point[],
  rotation = 0,
): string | null {
  const error = placementBatchError(s, type, points, rotation)
  if (error) return error

  const unique = points.filter((point, index) =>
    points.findIndex(candidate => candidate.x === point.x && candidate.z === point.z) === index,
  )
  for (const point of unique) s.buildings.push(createBuilding(s.nextId++, type, point.x, point.z, false, rotation))
  s.topology++
  recordEvent(s, unique.length + ' Wooden Wall blueprint' + (unique.length === 1 ? '' : 's') + ' planned by drag placement.')
  return null
}

export function demolishBuilding(s: WorldState, id: number): string | null {
  const index = s.buildings.findIndex(b => b.id === id)
  if (index < 0) return 'Building no longer exists.'
  const building = s.buildings[index]
  if (!building.complete) return 'Cancel unfinished blueprints instead.'
  if (building.type === 'stockpile' && building.x === 0 && building.z === 0) return 'The starter Stockpile cannot be demolished.'
  if (s.jobs.some(job => job.sourceId === id || job.targetId === id)) return 'Wait for active jobs involving this building to finish.'
  if (RESOURCE_IDS.some(resource => building.inventory[resource] > 0)) return 'Empty this building before demolition.'

  const refunds = emptyInventory()
  if (!building.destroyed) {
    for (const resource of RESOURCE_IDS) refunds[resource] = Math.floor(BUILDINGS[building.type].buildCost[resource] * 0.5)
  }

  const stores = stockpiles(s).filter(store => store.id !== id)
  const capacity = new Map(stores.map(store => [store.id, Math.max(0, freeStorage(s, store))]))
  const plan: Array<{ store: Building; resource: ResourceId; amount: number }> = []
  for (const resource of RESOURCE_IDS) {
    let remaining = refunds[resource]
    const destinations = stores
      .filter(store => stockpileAccepts(store, resource))
      .sort((a, b) => compareStockpileDestinations(a, b, building))
    for (const store of destinations) {
      if (remaining <= 0) break
      const room = capacity.get(store.id) ?? 0
      const amount = Math.min(room, remaining)
      if (amount <= 0) continue
      plan.push({ store, resource, amount })
      capacity.set(store.id, room - amount)
      remaining -= amount
    }
    if (remaining > 0) return 'Need ' + remaining + ' more free stockpile capacity for the demolition refund.'
  }

  for (const settler of s.settlers) {
    if (settler.workplaceId !== id) continue
    settler.workplaceId = null
    if (settler.jobId === null) {
      settler.path = []
      settler.pathRevision = -1
      settler.status = 'Needs work'
    }
  }
  s.buildings.splice(index, 1)
  s.residentialPlots = s.residentialPlots.filter(plot => plot.buildingId !== id)
  for (const refund of plan) refund.store.inventory[refund.resource] += refund.amount
  assignHousing(s)
  s.topology++
  const refundText = RESOURCE_IDS
    .filter(resource => refunds[resource] > 0)
    .map(resource => refunds[resource] + ' ' + resource)
    .join(', ')
  recordEvent(
    s,
    BUILDINGS[building.type].label + ' demolished' + (refundText ? '; recovered ' + refundText + '.' : '.'),
  )
  return null
}

export function cancelBuilding(s: WorldState, id: number): string | null {
  const index = s.buildings.findIndex(b => b.id === id)
  if (index < 0) return 'Blueprint no longer exists.'
  const building = s.buildings[index]
  if (building.complete) return 'Only unfinished blueprints can be cancelled.'

  const affected = s.jobs.filter(j => j.targetId === id)
  const refunds = emptyInventory()
  for (const resource of RESOURCE_IDS) refunds[resource] = building.delivered[resource]
  for (const job of affected) {
    if ((job.kind === 'deliver' || job.kind === 'repair') && job.stage === 'target') refunds[job.resource] += job.amount
  }

  const stores = stockpiles(s)
  const capacity = new Map(stores.map(store => [store.id, Math.max(0, freeStorage(s, store))]))
  const plan: Array<{ store: Building; resource: ResourceId; amount: number }> = []
  for (const resource of RESOURCE_IDS) {
    let remaining = refunds[resource]
    const destinations = stores
      .filter(store => stockpileAccepts(store, resource))
      .sort((a, b) => compareStockpileDestinations(a, b, building))
    for (const store of destinations) {
      if (remaining <= 0) break
      const room = capacity.get(store.id) ?? 0
      const amount = Math.min(room, remaining)
      if (amount <= 0) continue
      plan.push({ store, resource, amount })
      capacity.set(store.id, room - amount)
      remaining -= amount
    }
    if (remaining > 0) return `Need ${remaining} more free stockpile capacity to cancel safely.`
  }

  const affectedIds = new Set(affected.map(job => job.id))
  for (const job of affected) {
    const settler = s.settlers.find(a => a.id === job.settlerId)
    if (!settler) continue
    if ((job.kind === 'deliver' || job.kind === 'repair') && job.stage === 'target') settler.cargo[job.resource] = 0
    settler.jobId = null
    settler.path = []
    settler.pathRevision = -1
    settler.status = 'Needs work'
  }

  s.jobs = s.jobs.filter(job => !affectedIds.has(job.id))
  for (const refund of plan) refund.store.inventory[refund.resource] += refund.amount
  s.buildings.splice(index, 1)
  s.residentialPlots = s.residentialPlots.filter(plot => plot.buildingId !== id)
  s.topology++
  recordEvent(s, BUILDINGS[building.type].label + ' blueprint cancelled; materials returned to storage.')
  return null
}

export function assignHousing(s: WorldState): void {
  const beds = s.buildings
    .filter(b => b.complete && !b.destroyed && BUILDINGS[b.type].housing > 0)
    .flatMap(b => Array<number>(BUILDINGS[b.type].housing).fill(b.id))
  s.settlers.forEach((settler, i) => { settler.homeId = beds[i] ?? null })
}

export const readyToBuild = (b: Building): boolean =>
  RESOURCE_IDS.every(r => b.delivered[r] >= BUILDINGS[b.type].buildCost[r])

export const needsRepair = (b: Building): boolean =>
  b.complete && b.health < b.maxHealth
