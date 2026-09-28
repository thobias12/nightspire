import { worldHalf } from './MapGenerator'
import { BUILDINGS } from '../data/buildings'
import { assignHousing, available, stockpiles } from './Buildings'
import { dependentCount, settlementPopulation } from './Family'
import { houseBedCapacity } from './HouseProgression'
import { householdSummary } from './Households'
import { completedMarkets } from './Markets'
import { entrance } from './Navigation'
import { settlementNeeds } from './Needs'
import {
  MAX_SETTLERS, recordEvent, spawnSettler,
  type Point, type WorldState,
} from './WorldState'

export const IMMIGRATION_REQUIRED_DAYS = 2
export const IMMIGRATION_MIN_HAPPINESS = 65
export const IMMIGRATION_MIN_SAFETY = 55
export const IMMIGRATION_FOOD_PER_SETTLER = 2
export const IMMIGRATION_FOOD_PER_DEPENDENT = 1
export const IMMIGRATION_SCORE_THRESHOLD = 70

export interface AttractionBreakdown {
  score: number
  eligible: boolean
  spareBeds: number
  food: number
  foodRequired: number
  happiness: number
  safety: number
  raidReady: boolean
  households: number
  marketCoveredHouseholds: number
  recreationCoveredHouseholds: number
  blockers: string[]
}

export interface ImmigrationResult {
  arrived: boolean
  message: string
  attraction: AttractionBreakdown
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value))

function totalBeds(state: WorldState): number {
  return state.buildings
    .filter(building => building.complete && !building.destroyed)
    .reduce((sum, building) => sum + houseBedCapacity(building), 0)
}

function storedFood(state: WorldState): number {
  const central = stockpiles(state).reduce((sum, building) => sum + Math.max(0, available(state, building, 'food')), 0)
  const distributed = completedMarkets(state).reduce((sum, market) => sum + market.inventory.food, 0)
  const harvested = state.buildings
    .filter(building => building.type === 'farmhouse' && building.complete && !building.destroyed)
    .reduce((sum, farmhouse) => sum + farmhouse.inventory.food, 0)
  return central + distributed + harvested
}

function raidReady(state: WorldState): boolean {
  if (state.enemies.length > 0) return false
  return state.raid.wave === 0 || state.raid.lastClearedWave === state.raid.wave
}

export function populationAttraction(state: WorldState): AttractionBreakdown {
  const needs = settlementNeeds(state)
  const beds = totalBeds(state)
  const spareBeds = Math.max(0, beds - settlementPopulation(state))
  const food = storedFood(state)
  const foodRequired = state.settlers.length * IMMIGRATION_FOOD_PER_SETTLER
    + dependentCount(state) * IMMIGRATION_FOOD_PER_DEPENDENT
  const safeAfterRaid = raidReady(state)
  const households = householdSummary(state)
  const formalMarketEconomy = completedMarkets(state).length > 0

  const blockers: string[] = []
  if (state.settlers.length >= MAX_SETTLERS) blockers.push('Population cap reached')
  if (spareBeds <= 0) blockers.push('No spare bed')
  if (food < foodRequired) blockers.push('Need ' + foodRequired + ' stored Food')
  if (formalMarketEconomy && households.occupied > 0 && households.marketCovered < households.occupied) {
    blockers.push('Market coverage ' + households.marketCovered + '/' + households.occupied + ' occupied households')
  }
  if (needs.happiness < IMMIGRATION_MIN_HAPPINESS) blockers.push('Happiness below ' + IMMIGRATION_MIN_HAPPINESS + '%')
  if (needs.averages.safety < IMMIGRATION_MIN_SAFETY) blockers.push('Safety below ' + IMMIGRATION_MIN_SAFETY + '%')
  if (!safeAfterRaid) blockers.push(state.enemies.length > 0 ? 'Raid in progress' : 'Latest raid not cleared')

  const housingScore = spareBeds > 0 ? 25 : 0
  const foodScore = foodRequired > 0 ? clamp(food / foodRequired * 20, 0, 20) : 20
  const happinessScore = clamp((needs.happiness - 50) * 1.2, 0, 30)
  const safetyScore = clamp(needs.averages.safety - 40, 0, 20)
  const raidScore = safeAfterRaid ? 5 : 0
  const score = Math.round(housingScore + foodScore + happinessScore + safetyScore + raidScore)

  return {
    score,
    eligible: blockers.length === 0 && score >= IMMIGRATION_SCORE_THRESHOLD,
    spareBeds,
    food,
    foodRequired,
    happiness: needs.happiness,
    safety: Math.round(needs.averages.safety),
    raidReady: safeAfterRaid,
    households: households.occupied,
    marketCoveredHouseholds: households.marketCovered,
    recreationCoveredHouseholds: households.recreationCovered,
    blockers,
  }
}

function arrivalSpawn(index: number, half: number): Point {
  const entries: Point[] = [
    { x: -half + 1, z: -8 },
    { x: half - 1, z: 8 },
    { x: -8, z: -half + 1 },
    { x: 8, z: half - 1 },
  ]
  return entries[index % entries.length]
}

function arrivalDestination(state: WorldState): Point {
  const store = stockpiles(state).sort((a, b) => a.id - b.id)[0]
  return store ? entrance(store) : { x: 0, z: 2 }
}

function admitImmigrant(state: WorldState, attraction: AttractionBreakdown): ImmigrationResult {
  const spawn = arrivalSpawn(state.immigration.totalArrivals, worldHalf(state))
  const destination = arrivalDestination(state)
  if (!spawnSettler(state, spawn, destination)) {
    return { arrived: false, message: 'Population cap reached.', attraction: populationAttraction(state) }
  }

  state.immigration.totalArrivals++
  state.immigration.lastArrivalDay = state.day
  state.immigration.eligibleDays = 0
  assignHousing(state)
  recordEvent(state, 'A new settler is arriving from the wilds.')
  return {
    arrived: true,
    message: 'A new settler entered the map and is walking into Nightspire.',
    attraction,
  }
}

export function processImmigrationDay(state: WorldState): ImmigrationResult {
  const attraction = populationAttraction(state)
  if (state.immigration.lastEvaluationDay === state.day) {
    return { arrived: false, message: 'Immigration was already evaluated today.', attraction }
  }

  state.immigration.lastEvaluationDay = state.day
  if (!attraction.eligible) {
    state.immigration.eligibleDays = 0
    return {
      arrived: false,
      message: attraction.blockers[0] ?? 'Attraction score is too low.',
      attraction,
    }
  }

  state.immigration.eligibleDays++
  if (state.immigration.eligibleDays < IMMIGRATION_REQUIRED_DAYS) {
    return {
      arrived: false,
      message: 'Settlement qualifies. Hold conditions for one more Day.',
      attraction,
    }
  }

  return admitImmigrant(state, attraction)
}

export function forceImmigrationIfEligible(state: WorldState): ImmigrationResult {
  const attraction = populationAttraction(state)
  if (!attraction.eligible) {
    return {
      arrived: false,
      message: attraction.blockers[0] ?? 'Attraction score is too low.',
      attraction,
    }
  }
  return admitImmigrant(state, attraction)
}
