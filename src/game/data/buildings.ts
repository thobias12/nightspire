import type { Inventory } from './resources'

export type BuildingId = 'house' | 'stockpile'
export interface BuildingDefinition {
  id: BuildingId
  label: string
  footprint: number
  buildCost: Inventory
  constructionWork: number
  housing: number
  storage: number
  color: number
}
export const BUILDINGS: Record<BuildingId, BuildingDefinition> = {
  house: { id: 'house', label: 'House', footprint: 3, buildCost: { wood: 20, food: 0 }, constructionWork: 12, housing: 4, storage: 0, color: 0xb89973 },
  stockpile: { id: 'stockpile', label: 'Stockpile', footprint: 3, buildCost: { wood: 10, food: 0 }, constructionWork: 8, housing: 0, storage: 400, color: 0x8a9eaa },
}
