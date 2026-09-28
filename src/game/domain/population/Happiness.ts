import type { Job, Settler, WorldState } from '../world/WorldState'
import { happinessOf } from './Needs'

export type MoraleBand = 'thriving' | 'content' | 'strained' | 'unhappy' | 'miserable'

export interface HappinessEffect {
  happiness: number
  band: MoraleBand
  label: string
  workRate: number
  refusesNonessential: boolean
  reason: string | null
}

export interface SettlementHappinessEffect {
  averageHappiness: number
  averageWorkRate: number
  refusing: number
  bands: Record<MoraleBand, number>
}

const bandFor = (happiness: number): { band: MoraleBand; label: string; workRate: number } => {
  if (happiness >= 85) return { band: 'thriving', label: 'Thriving', workRate: 1.15 }
  if (happiness >= 65) return { band: 'content', label: 'Content', workRate: 1 }
  if (happiness >= 45) return { band: 'strained', label: 'Strained', workRate: 0.9 }
  if (happiness >= 25) return { band: 'unhappy', label: 'Unhappy', workRate: 0.75 }
  return { band: 'miserable', label: 'Miserable', workRate: 0.6 }
}

export function happinessEffect(settler: Settler): HappinessEffect {
  const happiness = happinessOf(settler)
  const band = bandFor(happiness)
  const severeHunger = settler.needs.food < 15
  const refusesNonessential = happiness < 20 || severeHunger
  return {
    happiness,
    ...band,
    workRate: severeHunger ? Math.min(band.workRate, 0.6) : band.workRate,
    refusesNonessential,
    reason: severeHunger ? 'Severe hunger' : happiness < 20 ? 'Very low happiness' : null,
  }
}

export function essentialJob(job: Pick<Job, 'kind' | 'resource'>): boolean {
  return job.kind === 'repair' || ((job.kind === 'gather' || job.kind === 'supply') && job.resource === 'food')
}

export function canAcceptJob(settler: Settler, job: Pick<Job, 'kind' | 'resource'>): boolean {
  const effect = happinessEffect(settler)
  return !effect.refusesNonessential || essentialJob(job)
}

export function workRateFor(settler: Settler, job: Pick<Job, 'kind' | 'resource'>): number {
  const effect = happinessEffect(settler)
  if (effect.refusesNonessential && !essentialJob(job)) return 0
  return effect.workRate
}

export function settlementHappinessEffect(state: WorldState): SettlementHappinessEffect {
  if (state.settlers.length === 0) {
    return {
      averageHappiness: 100,
      averageWorkRate: 1,
      refusing: 0,
      bands: { thriving: 0, content: 0, strained: 0, unhappy: 0, miserable: 0 },
    }
  }

  const bands: Record<MoraleBand, number> = {
    thriving: 0,
    content: 0,
    strained: 0,
    unhappy: 0,
    miserable: 0,
  }
  let happiness = 0
  let workRate = 0
  let refusing = 0

  for (const settler of state.settlers) {
    const effect = happinessEffect(settler)
    happiness += effect.happiness
    workRate += effect.workRate
    bands[effect.band]++
    if (effect.refusesNonessential) refusing++
  }

  return {
    averageHappiness: Math.round(happiness / state.settlers.length),
    averageWorkRate: workRate / state.settlers.length,
    refusing,
    bands,
  }
}
