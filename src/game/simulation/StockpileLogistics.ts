import { BUILDINGS } from '../data/buildings'
import { RESOURCE_IDS, type ResourceId } from '../data/resources'
import { distance } from './Navigation'
import type { Building, Point, StockpilePriority } from './WorldState'

export const STOCKPILE_PRIORITIES: readonly StockpilePriority[] = ['low', 'normal', 'high']

export function nextStockpilePriority(priority: StockpilePriority): StockpilePriority {
  const index = STOCKPILE_PRIORITIES.indexOf(priority)
  return STOCKPILE_PRIORITIES[(index + 1) % STOCKPILE_PRIORITIES.length]
}

export function stockpilePriorityLabel(priority: StockpilePriority): string {
  return priority[0].toUpperCase() + priority.slice(1)
}

export function stockpileAccepts(building: Building, resource: ResourceId): boolean {
  return BUILDINGS[building.type].storage > 0 && building.stockpileFilters[resource] === true
}

export function acceptedStockpileResources(building: Building): ResourceId[] {
  if (BUILDINGS[building.type].storage <= 0) return []
  return RESOURCE_IDS.filter(resource => stockpileAccepts(building, resource))
}

export function stockpilePriorityRank(priority: StockpilePriority): number {
  return priority === 'high' ? 2 : priority === 'normal' ? 1 : 0
}

/**
 * Destination ordering is intentionally tiered: priority first, then travel distance,
 * then id for deterministic ties. Existing stock remains withdrawable even if a filter
 * is later disabled; filters only govern new inbound storage.
 */
export function compareStockpileDestinations(
  a: Building,
  b: Building,
  origin: Point,
): number {
  const priority = stockpilePriorityRank(b.stockpilePriority) - stockpilePriorityRank(a.stockpilePriority)
  if (priority !== 0) return priority
  const travel = distance(origin, a) - distance(origin, b)
  if (Math.abs(travel) > 1e-9) return travel
  return a.id - b.id
}
