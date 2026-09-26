export interface WorldState {
  elapsedSeconds: number
  day: number
  timeOfDay: number
  settlers: number
  enemies: number
}

export const createInitialWorldState = (): WorldState => ({
  elapsedSeconds: 0,
  day: 1,
  timeOfDay: 0.32,
  settlers: 8,
  enemies: 0,
})
