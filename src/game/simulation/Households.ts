import { BUILDINGS } from '../data/buildings'
import { dependentCountAtHome } from './Family'
import { completedMarkets, marketCoversPoint, MARKET_COVERAGE_RADIUS } from './Markets'
import { distance } from './Navigation'
import { serviceAvailable } from './Services'
import { workplaceStaffing } from './Workforce'
import { NEED_IDS, type Building, type Settler, type WorldState } from './WorldState'

export const RECREATION_COVERAGE_RADIUS = 18

export interface HouseholdStatus {
  house: Building
  residents: Settler[]
  dependents: number
  market: Building | null
  marketDistance: number | null
  foodAccess: boolean
  foodAccessLabel: string
  recreation: Building | null
  recreationDistance: number | null
  recreationAccess: boolean
  safety: number
  satisfaction: number
}

export interface HouseholdSummary {
  households: number
  occupied: number
  marketCovered: number
  recreationCovered: number
  fullySupported: number
}

export function houseResidents(state: WorldState, houseId: number): Settler[] {
  return state.settlers.filter(settler => settler.homeId === houseId)
}

function operationalMarketForHouse(state: WorldState, house: Building): Building | null {
  return completedMarkets(state)
    .filter(market => {
      const staffing = workplaceStaffing(state, market)
      return staffing.assigned > 0 && market.inventory.food > 0 && marketCoversPoint(market, house)
    })
    .sort((a, b) => {
      const travel = distance(house, a) - distance(house, b)
      return Math.abs(travel) > 1e-9 ? travel : a.id - b.id
    })[0] ?? null
}

function recreationForHouse(state: WorldState, house: Building): Building | null {
  return state.buildings
    .filter(building =>
      building.complete
      && !building.destroyed
      && !!BUILDINGS[building.type].service
      && serviceAvailable(building)
      && distance(house, building) <= RECREATION_COVERAGE_RADIUS
    )
    .sort((a, b) => {
      const serviceA = BUILDINGS[a.type].service!
      const serviceB = BUILDINGS[b.type].service!
      return serviceB.priority - serviceA.priority
        || distance(house, a) - distance(house, b)
        || a.id - b.id
    })[0] ?? null
}

export function householdStatus(state: WorldState, house: Building): HouseholdStatus {
  const residents = houseResidents(state, house.id)
  const dependents = dependentCountAtHome(state, house.id)
  const markets = completedMarkets(state)
  const market = operationalMarketForHouse(state, house)
  const recreation = recreationForHouse(state, house)
  const marketDistance = market ? distance(house, market) : null
  const recreationDistance = recreation ? distance(house, recreation) : null
  const foodAccess = markets.length === 0 || market !== null
  const foodAccessLabel = markets.length === 0
    ? 'Camp rations'
    : market
      ? BUILDINGS[market.type].label + ' ' + market.id
      : 'No stocked staffed Market within ' + MARKET_COVERAGE_RADIUS + 'm'
  const safety = residents.length
    ? Math.round(residents.reduce((sum, settler) => sum + settler.needs.safety, 0) / residents.length)
    : 0
  const satisfaction = residents.length
    ? Math.round(
        residents.reduce(
          (sum, settler) => sum + NEED_IDS.reduce((needSum, need) => needSum + settler.needs[need], 0) / NEED_IDS.length,
          0,
        ) / residents.length,
      )
    : 0

  return {
    house,
    residents,
    dependents,
    market,
    marketDistance,
    foodAccess,
    foodAccessLabel,
    recreation,
    recreationDistance,
    recreationAccess: recreation !== null,
    safety,
    satisfaction,
  }
}

export function householdStatuses(state: WorldState): HouseholdStatus[] {
  return state.buildings
    .filter(building => building.type === 'house' && building.complete && !building.destroyed)
    .sort((a, b) => a.id - b.id)
    .map(house => householdStatus(state, house))
}

export function householdSummary(state: WorldState): HouseholdSummary {
  const households = householdStatuses(state)
  const occupied = households.filter(status => status.residents.length > 0)
  return {
    households: households.length,
    occupied: occupied.length,
    marketCovered: occupied.filter(status => status.foodAccess).length,
    recreationCovered: occupied.filter(status => status.recreationAccess).length,
    fullySupported: occupied.filter(status => status.foodAccess && status.recreationAccess && status.safety >= 55).length,
  }
}
