import { BUILDINGS } from '../data/buildings'
import type { DayPhase } from './DayNight'
import { recordEvent, type Building, type WorldState } from './WorldState'

export function productionAvailable(building: Building, phase: DayPhase): boolean {
  const production = BUILDINGS[building.type].production
  return !!production
    && building.complete
    && !building.destroyed
    && production.activePhases.includes(phase)
    && building.inventory[production.inputResource] >= production.inputAmount
    && building.inventory[production.outputResource] + production.outputAmount <= production.outputCapacity
}

export function updateProduction(state: WorldState, delta: number, phase: DayPhase): void {
  for (const building of state.buildings) {
    const production = BUILDINGS[building.type].production
    if (!production || !building.complete || building.destroyed) {
      building.productionProgress = 0
      continue
    }
    if (!production.activePhases.includes(phase)) continue

    if (
      building.inventory[production.inputResource] < production.inputAmount
      || building.inventory[production.outputResource] + production.outputAmount > production.outputCapacity
    ) {
      continue
    }

    building.productionProgress += delta
    while (
      building.productionProgress + 1e-8 >= production.cycleSeconds
      && building.inventory[production.inputResource] >= production.inputAmount
      && building.inventory[production.outputResource] + production.outputAmount <= production.outputCapacity
    ) {
      building.productionProgress -= production.cycleSeconds
      building.inventory[production.inputResource] -= production.inputAmount
      building.inventory[production.outputResource] += production.outputAmount
      state.totals.productionConsumed[production.inputResource] += production.inputAmount
      state.totals.produced[production.outputResource] += production.outputAmount
      recordEvent(
        state,
        BUILDINGS[building.type].label + ' produced ' + production.outputAmount + ' ' + production.outputResource + '.',
      )
    }
  }
}
