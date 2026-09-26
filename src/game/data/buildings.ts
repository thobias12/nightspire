import type { ResourceId } from './resources'

export type BuildingId =
  | 'house'
  | 'woodcutter'
  | 'forager'
  | 'stockpile'
  | 'blacksmith'
  | 'tavern'
  | 'guard-post'
  | 'wood-wall'
  | 'wood-gate'

export interface BuildingDefinition {
  id: BuildingId
  label: string
  buildCost: Partial<Record<ResourceId, number>>
  workerSlots: number
  hitPoints: number
}

export const BUILDINGS: readonly BuildingDefinition[] = [
  { id: 'house', label: 'House', buildCost: { wood: 20 }, workerSlots: 0, hitPoints: 160 },
  { id: 'woodcutter', label: 'Woodcutter', buildCost: { wood: 25 }, workerSlots: 2, hitPoints: 140 },
  { id: 'forager', label: 'Forager Hut', buildCost: { wood: 20 }, workerSlots: 2, hitPoints: 120 },
  { id: 'stockpile', label: 'Stockpile', buildCost: { wood: 10 }, workerSlots: 0, hitPoints: 100 },
  { id: 'blacksmith', label: 'Blacksmith', buildCost: { wood: 35, stone: 20 }, workerSlots: 2, hitPoints: 220 },
  { id: 'tavern', label: 'Tavern', buildCost: { wood: 40, stone: 15 }, workerSlots: 3, hitPoints: 200 },
  { id: 'guard-post', label: 'Guard Post', buildCost: { wood: 30, stone: 10 }, workerSlots: 4, hitPoints: 240 },
  { id: 'wood-wall', label: 'Wooden Wall', buildCost: { wood: 8 }, workerSlots: 0, hitPoints: 260 },
  { id: 'wood-gate', label: 'Wooden Gate', buildCost: { wood: 30 }, workerSlots: 0, hitPoints: 500 },
]
