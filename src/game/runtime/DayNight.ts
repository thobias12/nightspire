export type DayPhase = 'dawn' | 'day' | 'dusk' | 'night'

export const DAWN_START = 5 / 24
export const DAY_START = 6 / 24
export const DUSK_START = 18 / 24
export const NIGHT_START = 20 / 24

export function phaseForTime(timeOfDay: number): DayPhase {
  const t = timeOfDay >= 0 && timeOfDay < 1 ? timeOfDay : ((timeOfDay % 1) + 1) % 1
  const minute = Math.floor(t * 1440 + 1e-7)
  if (minute >= 300 && minute < 360) return 'dawn'
  if (minute >= 360 && minute < 1080) return 'day'
  if (minute >= 1080 && minute < 1200) return 'dusk'
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
