import type { Inventory } from './resources'

export type BuildingId = 'house' | 'stockpile' | 'guard-post' | 'wood-wall' | 'wood-gate'
export interface BuildingDefinition {
  id: BuildingId
  label: string
  footprint: number
  buildCost: Inventory
  constructionWork: number
  housing: number
  storage: number
  guardSlots: number
  maxHealth: number
  fortification: boolean
  friendlyPassable: boolean
  color: number
}
export const BUILDINGS: Record<BuildingId, BuildingDefinition> = {
  house: {
    id: 'house', label: 'House', footprint: 3, buildCost: { wood: 20, food: 0 },
    constructionWork: 12, housing: 4, storage: 0, guardSlots: 0, maxHealth: 180,
    fortification: false, friendlyPassable: false, color: 0xb89973,
  },
  stockpile: {
    id: 'stockpile', label: 'Stockpile', footprint: 3, buildCost: { wood: 10, food: 0 },
    constructionWork: 8, housing: 0, storage: 400, guardSlots: 0, maxHealth: 220,
    fortification: false, friendlyPassable: false, color: 0x8a9eaa,
  },
  'guard-post': {
    id: 'guard-post', label: 'Guard Post', footprint: 3, buildCost: { wood: 25, food: 0 },
    constructionWork: 10, housing: 0, storage: 0, guardSlots: 2, maxHealth: 200,
    fortification: false, friendlyPassable: false, color: 0x8e6b58,
  },
  'wood-wall': {
    id: 'wood-wall', label: 'Wooden Wall', footprint: 1, buildCost: { wood: 5, food: 0 },
    constructionWork: 3, housing: 0, storage: 0, guardSlots: 0, maxHealth: 120,
    fortification: true, friendlyPassable: false, color: 0x6f543d,
  },
  'wood-gate': {
    id: 'wood-gate', label: 'Wooden Gate', footprint: 1, buildCost: { wood: 15, food: 0 },
    constructionWork: 6, housing: 0, storage: 0, guardSlots: 0, maxHealth: 220,
    fortification: true, friendlyPassable: true, color: 0x8a6847,
  },
}
