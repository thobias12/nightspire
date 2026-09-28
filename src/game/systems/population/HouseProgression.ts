import { BUILDINGS } from '../../data/buildings'
import { householdStatus } from './Households'
import { recordEvent, type Building, type WorldState } from '../../model/WorldState'

export type HouseLevel = 1 | 2 | 3

export interface HouseProgressionRule {
  level: HouseLevel
  label: string
  beds: number
  requiredDays: number
  minimumSafety: number
  minimumSatisfaction: number
}

export interface HouseProgressionStatus {
  level: HouseLevel
  label: string
  beds: number
  next: HouseProgressionRule | null
  qualifyingDays: number
  qualifiesToday: boolean
  blockers: string[]
}

export const HOUSE_LEVELS: Record<HouseLevel, HouseProgressionRule> = {
  1: { level: 1, label: 'Cottage', beds: 4, requiredDays: 0, minimumSafety: 0, minimumSatisfaction: 0 },
  2: { level: 2, label: 'Established Home', beds: 5, requiredDays: 2, minimumSafety: 60, minimumSatisfaction: 70 },
  3: { level: 3, label: 'Prosperous Home', beds: 6, requiredDays: 3, minimumSafety: 70, minimumSatisfaction: 80 },
}

function levelOf(house: Building): HouseLevel {
  return Math.max(1, Math.min(3, Math.round(house.houseLevel))) as HouseLevel
}

export function houseBedCapacity(house: Building): number {
  if (house.type !== 'house') return BUILDINGS[house.type].housing
  return HOUSE_LEVELS[levelOf(house)].beds
}

export function houseProgressionStatus(state: WorldState, house: Building): HouseProgressionStatus {
  const level = levelOf(house)
  const current = HOUSE_LEVELS[level]
  const next = level < 3 ? HOUSE_LEVELS[(level + 1) as HouseLevel] : null
  const household = householdStatus(state, house)
  const blockers: string[] = []

  if (next) {
    if (household.residents.length === 0) blockers.push('Household is empty')
    if (!household.foodAccess) blockers.push('No Market Food access')
    if (!household.recreationAccess) blockers.push('No recreation access')
    if (household.safety < next.minimumSafety) blockers.push('Safety below ' + next.minimumSafety + '%')
    if (household.satisfaction < next.minimumSatisfaction) blockers.push('Satisfaction below ' + next.minimumSatisfaction + '%')
  }

  return {
    level,
    label: current.label,
    beds: current.beds,
    next,
    qualifyingDays: house.houseQualifyingDays,
    qualifiesToday: next !== null && blockers.length === 0,
    blockers,
  }
}

export function processHouseholdProgression(state: WorldState): number {
  let upgrades = 0
  const houses = state.buildings.filter(building =>
    building.type === 'house' && building.complete && !building.destroyed,
  )

  for (const house of houses) {
    if (house.houseLastEvaluationDay === state.day) continue
    house.houseLastEvaluationDay = state.day

    const status = houseProgressionStatus(state, house)
    if (!status.next) {
      house.houseQualifyingDays = 0
      continue
    }

    if (!status.qualifiesToday) {
      house.houseQualifyingDays = 0
      continue
    }

    house.houseQualifyingDays++
    if (house.houseQualifyingDays < status.next.requiredDays) continue

    house.houseLevel = status.next.level
    house.houseQualifyingDays = 0
    upgrades++
    recordEvent(
      state,
      'House ' + house.id + ' advanced to ' + status.next.label + ' and now provides ' + status.next.beds + ' beds.',
    )
  }

  return upgrades
}
