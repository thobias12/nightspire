export const MAP_SIZES = [129, 257, 513] as const

export type MapSize = typeof MAP_SIZES[number]
export const LANDSCAPES = {
  meadows: { name: 'Verdant Marches', subtitle: 'Meadows & old woods', description: 'Broad connected meadows, wooded edges and scattered resource copses.', forest: 0.46 },
  woodland: { name: 'The Elderwood', subtitle: 'Forest & clearings', description: 'Deep woodland broken by irregular glades and long open rides.', forest: 0.35 },
  riverlands: { name: 'The Winding Vale', subtitle: 'River & floodplain', description: 'A winding river divides meadow and woodland. Three shallow fords keep both banks reachable.', forest: 0.43 },
  lakeland: { name: 'The Mere Country', subtitle: 'Lakes & woodland', description: 'Quiet lakes, damp shores and broken woods surround generous settlement clearings.', forest: 0.4 },
} as const
export type Landscape = keyof typeof LANDSCAPES

export interface MapDefinition {
  version: 1 | 2
  seed: number
  size: MapSize
  landscape: Landscape
}
