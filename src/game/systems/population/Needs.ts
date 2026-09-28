import { BUILDINGS } from '../../data/buildings'
import { available, stockpiles } from '../construction/Buildings'
import type { DayPhase } from '../../runtime/DayNight'
import { compareMarketsForSettler, completedMarkets, marketCoversSettler, marketMealsRemaining } from '../economy/Markets'
import { NEED_IDS, recordEvent, type NeedId, type NeedLevels, type Settler, type WorldState } from '../../model/WorldState'

const FOOD_DECAY_PER_SECOND = 22 / 360
const RECREATION_DECAY_PER_SECOND = 18 / 360
const HOUSING_APPROACH_PER_SECOND = 0.35
const SAFETY_APPROACH_PER_SECOND = 0.25

const clamp = (value: number): number => Math.max(0, Math.min(100, value))
const approach = (value: number, target: number, amount: number): number =>
  value < target ? Math.min(target, value + amount) : Math.max(target, value - amount)

export interface NeedSummary {
  averages: NeedLevels
  happiness: number
  worst: NeedId
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
  const markets = completedMarkets(state)
  const useMarkets = markets.length > 0
  const stores = useMarkets ? [] : stockpiles(state).sort((a, b) => a.id - b.id)

  for (const settler of due) {
    if (useMarkets) {
      const source = markets
        .filter(market =>
          market.inventory.food > 0
          && marketMealsRemaining(state, market) > 0
          && marketCoversSettler(state, settler, market)
        )
        .sort((a, b) => compareMarketsForSettler(state, settler, a, b))[0]
      if (source) {
        source.inventory.food--
        source.distributionServed++
        settler.needs.food = 100
        settler.lastMealDay = state.day
        state.totals.foodConsumed++
        served++
      } else {
        missed++
      }
      continue
    }

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
    recordEvent(
      state,
      useMarkets
        ? 'Market shortage: ' + waiting + ' settlers are waiting for today\'s distributed meal.'
        : 'Food shortage: ' + waiting + ' settlers are waiting for today\'s meal.',
    )
  } else if (served > 0 && waiting === 0) {
    recordEvent(
      state,
      useMarkets
        ? 'Market distribution complete. All ' + state.settlers.length + ' settlers have eaten.'
        : 'Daily meal complete. All ' + state.settlers.length + ' settlers have eaten.',
    )
  }
  return { served, missed }
}

export function updateNeeds(state: WorldState, delta: number, _phase: DayPhase): void {
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
  }
}
