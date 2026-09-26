import { BUILDINGS } from '../data/buildings'
import { available, stockpiles } from './Buildings'
import type { DayPhase } from './DayNight'
import { blockedCells, cellKey, distance, inBounds } from './Navigation'
import {
  NEED_IDS, recordEvent,
  type Building, type NeedId, type NeedLevels, type Point, type Settler, type WorldState,
} from './WorldState'

const FOOD_DECAY_PER_SECOND = 22 / 360
const RECREATION_DECAY_PER_SECOND = 18 / 360
const HOUSING_APPROACH_PER_SECOND = 0.35
const SAFETY_APPROACH_PER_SECOND = 0.25
const RECREATION_GAIN_PER_SECOND = 4

const RECREATION_OFFSETS: Point[] = [
  { x: -1, z: -1 }, { x: 0, z: -1 }, { x: 1, z: -1 },
  { x: 1, z: 0 }, { x: 1, z: 1 }, { x: -1, z: 1 },
]

const clamp = (value: number): number => Math.max(0, Math.min(100, value))
const approach = (value: number, target: number, amount: number): number =>
  value < target ? Math.min(target, value + amount) : Math.max(target, value - amount)

export interface NeedSummary {
  averages: NeedLevels
  happiness: number
  worst: NeedId
}

export interface RecreationAssignment {
  buildingId: number
  slot: number
  target: Point
}

export function happinessOf(settler: Settler): number {
  return Math.round(NEED_IDS.reduce((sum, need) => sum + settler.needs[need], 0) / NEED_IDS.length)
}

export function settlementNeeds(state: WorldState): NeedSummary {
  const count = Math.max(1, state.settlers.length)
  const averages = Object.fromEntries(
    NEED_IDS.map(need => [need, state.settlers.reduce((sum, settler) => sum + settler.needs[need], 0) / count]),
  ) as NeedLevels
  const worst = [...NEED_IDS].sort((a, b) => averages[a] - averages[b])[0]
  return {
    averages,
    happiness: Math.round(NEED_IDS.reduce((sum, need) => sum + averages[need], 0) / NEED_IDS.length),
    worst,
  }
}

function recreationBuildings(state: WorldState): Building[] {
  return state.buildings.filter(
    building => building.complete && !building.destroyed && BUILDINGS[building.type].recreationSlots > 0,
  )
}

export function recreationAssignment(state: WorldState, settler: Settler): RecreationAssignment | null {
  if (settler.role === 'guard' || settler.health <= 0) return null
  const eligible = state.settlers.filter(a => a.role !== 'guard' && a.health > 0)
  const settlerIndex = eligible.findIndex(a => a.id === settler.id)
  if (settlerIndex < 0) return null

  const blocked = blockedCells(state, false)
  const slots = recreationBuildings(state).flatMap(building =>
    RECREATION_OFFSETS
      .slice(0, BUILDINGS[building.type].recreationSlots)
      .map((offset, slot) => ({
        building,
        slot,
        target: { x: building.x + offset.x, z: building.z + offset.z },
      }))
      .filter(entry => inBounds(entry.target) && !blocked.has(cellKey(entry.target))),
  )
  const assigned = slots[settlerIndex]
  if (!assigned) return null

  return {
    buildingId: assigned.building.id,
    slot: assigned.slot,
    target: assigned.target,
  }
}

function safetyTarget(state: WorldState): number {
  if (state.enemies.length > 0) return 10

  const guards = state.settlers.filter(a => a.role === 'guard' && a.health > 0).length
  const fortifications = state.buildings.filter(
    b => b.complete && !b.destroyed && BUILDINGS[b.type].fortification,
  ).length
  const damaged = state.buildings.filter(b => b.complete && b.health < b.maxHealth).length
  const raidConfidence = state.raid.wave === 0 ? 5 : state.raid.lastClearedWave === state.raid.wave ? 10 : -5

  return clamp(
    50
    + Math.min(20, guards * 5)
    + Math.min(20, fortifications * 2)
    - Math.min(25, damaged * 5)
    + raidConfidence,
  )
}

export function serveDailyMeal(state: WorldState, announceShortage = false): { served: number; missed: number } {
  const due = state.settlers.filter(settler => settler.lastMealDay < state.day)
  if (due.length === 0) return { served: 0, missed: 0 }

  let served = 0
  let missed = 0
  const stores = stockpiles(state).sort((a, b) => a.id - b.id)

  for (const settler of due) {
    const source = stores.find(store => available(state, store, 'food') > 0)
    if (source) {
      source.inventory.food--
      settler.needs.food = 100
      settler.lastMealDay = state.day
      state.totals.foodConsumed++
      served++
    } else {
      missed++
    }
  }

  const waiting = state.settlers.filter(settler => settler.lastMealDay < state.day).length
  if (announceShortage && waiting > 0) {
    recordEvent(state, 'Food shortage: ' + waiting + ' settlers are waiting for today\'s meal.')
  } else if (served > 0 && waiting === 0) {
    recordEvent(state, 'Daily meal complete. All ' + state.settlers.length + ' settlers have eaten.')
  }
  return { served, missed }
}

export function updateNeeds(state: WorldState, delta: number, phase: DayPhase): void {
  const safety = safetyTarget(state)

  for (const settler of state.settlers) {
    settler.needs.food = clamp(settler.needs.food - FOOD_DECAY_PER_SECOND * delta)
    settler.needs.recreation = clamp(settler.needs.recreation - RECREATION_DECAY_PER_SECOND * delta)

    const housingTarget = settler.homeId === null ? 20 : 100
    settler.needs.housing = approach(
      settler.needs.housing,
      housingTarget,
      HOUSING_APPROACH_PER_SECOND * delta,
    )
    settler.needs.safety = approach(
      settler.needs.safety,
      safety,
      SAFETY_APPROACH_PER_SECOND * delta,
    )

    if (phase === 'dusk' || phase === 'dawn') {
      const recreation = recreationAssignment(state, settler)
      if (recreation && distance(settler, recreation.target) < 0.2) {
        settler.needs.recreation = clamp(
          settler.needs.recreation + RECREATION_GAIN_PER_SECOND * delta,
        )
      }
    }
  }
}
