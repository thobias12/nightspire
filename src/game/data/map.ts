export const MAP_SIZES = [129, 257, 513] as const

export type MapSize = typeof MAP_SIZES[number]
export type Landscape = 'meadows' | 'woodland'

export interface MapDefinition {
  version: 1
  seed: number
  size: MapSize
  landscape: Landscape
}
