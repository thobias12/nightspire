export type DayPhase = 'dawn' | 'day' | 'dusk' | 'night'

export const DAWN_START = 5 / 24
export const DAY_START = 6 / 24
export const DUSK_START = 18 / 24
export const NIGHT_START = 20 / 24

export function phaseForTime(timeOfDay: number): DayPhase {
  const t = ((timeOfDay % 1) + 1) % 1
  if (t >= DAWN_START && t < DAY_START) return 'dawn'
  if (t >= DAY_START && t < DUSK_START) return 'day'
  if (t >= DUSK_START && t < NIGHT_START) return 'dusk'
  return 'night'
}

export const isWorkPhase = (phase: DayPhase): boolean => phase === 'day'

export function phaseLabel(phase: DayPhase): string {
  switch (phase) {
    case 'dawn': return 'Dawn'
    case 'day': return 'Day'
    case 'dusk': return 'Dusk'
    case 'night': return 'Night'
  }
}
