import { stockpiles } from '../construction/Buildings'
import type { WorldState } from '../../model/WorldState'

export const TOOL_WORK_BONUS_MAX = 0.1
export const SETTLERS_PER_TOOL = 2

export interface ToolCoverage {
  stored: number
  required: number
  coverage: number
  workMultiplier: number
}

export function toolCoverage(state: WorldState): ToolCoverage {
  const stored = stockpiles(state).reduce((sum, building) => sum + building.inventory.tools, 0)
  const required = Math.max(1, Math.ceil(state.settlers.length / SETTLERS_PER_TOOL))
  const coverage = Math.min(1, stored / required)
  return {
    stored,
    required,
    coverage,
    workMultiplier: 1 + coverage * TOOL_WORK_BONUS_MAX,
  }
}
