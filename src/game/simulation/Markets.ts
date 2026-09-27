import { BUILDINGS } from '../data/buildings'
import type { JobReservations } from './JobReservations'
import { distance } from './Navigation'
import { workplaceStaffing } from './Workforce'
import type { Building, Point, Settler, WorldState } from './WorldState'

export const MARKET_COVERAGE_RADIUS = 18

export interface MarketSummary {
  markets: number
  staffed: number
  active: number
  food: number
  capacity: number
  mealsServed: number
  mealCapacity: number
}

export function completedMarkets(state: WorldState): Building[] {
  return state.buildings.filter(building =>
    building.type === 'market' && building.complete && !building.destroyed,
  )
}

export function marketFoodCapacity(building: Building): number {
  return BUILDINGS[building.type].foodDistribution?.capacity ?? 0
}

export function marketAssignedCapacity(state: WorldState, building: Building): number {
  const distribution = BUILDINGS[building.type].foodDistribution
  if (!distribution) return 0
  const assigned = workplaceStaffing(state, building).assigned
  return assigned * distribution.mealsPerWorkerPerDay
}

export function marketFoodTarget(state: WorldState, building: Building): number {
  const distribution = BUILDINGS[building.type].foodDistribution
  if (!distribution) return 0
  const assigned = workplaceStaffing(state, building).assigned
  if (assigned <= 0) return 0
  return Math.min(
    distribution.capacity,
    assigned * distribution.mealsPerWorkerPerDay * distribution.reserveDays,
  )
}

export function marketFoodNeed(
  state: WorldState,
  building: Building,
  index?: JobReservations,
): number {
  if (!BUILDINGS[building.type].foodDistribution || !building.complete || building.destroyed) return 0
  const target = marketFoodTarget(state, building)
  if (target <= 0) return 0
  const incoming = index
    ? index.supplied(building.id, 'food')
    : state.jobs
      .filter(job => job.kind === 'supply' && job.targetId === building.id && job.resource === 'food')
      .reduce((sum, job) => sum + job.amount, 0)
  return Math.max(0, target - building.inventory.food - incoming)
}

export function resetMarketDistributionDay(building: Building, day: number): void {
  if (building.distributionDay === day) return
  building.distributionDay = day
  building.distributionServed = 0
}

export function marketMealCapacity(state: WorldState, building: Building): number {
  const distribution = BUILDINGS[building.type].foodDistribution
  if (!distribution || !building.complete || building.destroyed) return 0
  return workplaceStaffing(state, building).active * distribution.mealsPerWorkerPerDay
}

export function marketMealsRemaining(state: WorldState, building: Building): number {
  resetMarketDistributionDay(building, state.day)
  return Math.max(0, marketMealCapacity(state, building) - building.distributionServed)
}

export function marketOperational(state: WorldState, building: Building): boolean {
  return marketMealsRemaining(state, building) > 0 && building.inventory.food > 0
}

export function marketOrigin(state: WorldState, settler: Settler): Point {
  if (settler.homeId !== null) {
    const home = state.buildings.find(building => building.id === settler.homeId)
    if (home) return home
  }
  return settler
}

export function compareMarketsForSettler(
  state: WorldState,
  settler: Settler,
  a: Building,
  b: Building,
): number {
  const origin = marketOrigin(state, settler)
  const travel = distance(origin, a) - distance(origin, b)
  if (Math.abs(travel) > 1e-9) return travel
  return a.id - b.id
}

export function marketCoversPoint(market: Building, point: Point): boolean {
  return distance(market, point) <= MARKET_COVERAGE_RADIUS
}

export function marketCoversSettler(state: WorldState, settler: Settler, market: Building): boolean {
  return marketCoversPoint(market, marketOrigin(state, settler))
}

export function marketSummary(state: WorldState): MarketSummary {
  const markets = completedMarkets(state)
  let staffed = 0
  let active = 0
  let food = 0
  let capacity = 0
  let mealsServed = 0
  let mealCapacity = 0

  for (const market of markets) {
    const staffing = workplaceStaffing(state, market)
    if (staffing.assigned > 0) staffed++
    if (staffing.active > 0) active++
    food += market.inventory.food
    capacity += marketFoodCapacity(market)
    if (market.distributionDay === state.day) mealsServed += market.distributionServed
    mealCapacity += marketMealCapacity(state, market)
  }

  return { markets: markets.length, staffed, active, food, capacity, mealsServed, mealCapacity }
}
