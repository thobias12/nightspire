import type { Point } from '../model/WorldState'

/** Stable packed key for every supported regional grid. */
export const cellKey = (point: Point): number =>
  (Math.round(point.z) + 512) * 1025 + Math.round(point.x) + 512

export const inBounds = (point: Point, half: number): boolean =>
  Math.abs(point.x) <= half && Math.abs(point.z) <= half

export const distance = (a: Point, b: Point): number =>
  Math.hypot(a.x - b.x, a.z - b.z)
