import { BUILDINGS, type BuildingId } from '../data/buildings'
import { emptyInventory, RESOURCE_IDS, type ResourceId } from '../data/resources'
import { blockedCells, cellKey, distance, entrance, flood, footprint, inBounds } from './Navigation'
import { recordEvent, type Building, type Point, type WorldState } from './WorldState'

export const stockpiles = (s: WorldState): Building[] => s.buildings.filter(b => b.complete && BUILDINGS[b.type].storage > 0)
export const reserved = (s: WorldState, id: number, resource: ResourceId): number =>
  s.jobs.filter(j => j.kind === 'deliver' && j.sourceId === id && j.stage === 'source' && j.resource === resource).reduce((n, j) => n + j.amount, 0)
export const available = (s: WorldState, b: Building, resource: ResourceId): number => b.inventory[resource] - reserved(s, b.id, resource)
export function freeStorage(s: WorldState, b: Building): number {
  const incoming = s.jobs.filter(j => j.kind === 'gather' && j.targetId === b.id).reduce((n, j) => n + j.amount, 0)
  return BUILDINGS[b.type].storage - b.inventory.wood - b.inventory.food - incoming
}
export function placementError(s: WorldState, type: BuildingId, p: Point): string | null {
  if (!Number.isInteger(p.x) || !Number.isInteger(p.z)) return 'Place on the grid.'
  if (s.buildings.length >= 80) return 'M1 building limit reached (80).'
  const cells = footprint({ ...p, type }), blocked = blockedCells(s)
  if (cells.some(c => !inBounds(c)) || !inBounds({ x: p.x, z: p.z + 2 })) return 'Outside the camp boundary.'
  if (cells.some(c => blocked.has(cellKey(c)))) return 'Overlaps a building.'
  const occupied = new Set(cells.map(cellKey))
  if (s.nodes.some(n => n.remaining > 0 && occupied.has(cellKey(n)))) return 'Clear the resources first.'
  if ([s.player, ...s.settlers].some(a => cells.some(c => distance(a, c) < 1.05))) return 'Someone is standing here.'
  for (const c of cells) blocked.add(cellKey(c))
  const reachable = flood({ x: 0, z: 2 }, blocked)
  const required = [...s.buildings.map(entrance), { x: p.x, z: p.z + 2 }, s.player, ...s.settlers, ...s.nodes.filter(n => n.remaining > 0)]
  if (required.some(a => !reachable.has(cellKey(a)))) return 'Keep entrances and gathering routes connected.'
  return null
}
export function placeBuilding(s: WorldState, type: BuildingId, p: Point): string | null {
  const error = placementError(s, type, p)
  if (error) return error
  s.buildings.push({ id: s.nextId++, type, ...p, complete: false, work: 0, inventory: emptyInventory(), delivered: emptyInventory() })
  s.topology++
  recordEvent(s, BUILDINGS[type].label + ' planned. Settlers will deliver materials.')
  return null
}
export function assignHousing(s: WorldState): void {
  const beds = s.buildings.filter(b => b.complete && BUILDINGS[b.type].housing > 0)
    .flatMap(b => Array<number>(BUILDINGS[b.type].housing).fill(b.id))
  s.settlers.forEach((settler, i) => { settler.homeId = beds[i] ?? null })
}
export const readyToBuild = (b: Building): boolean => RESOURCE_IDS.every(r => b.delivered[r] >= BUILDINGS[b.type].buildCost[r])
