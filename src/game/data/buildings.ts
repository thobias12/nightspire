import type { Inventory, ResourceId } from './resources'

export type ServiceNeedId = 'recreation'
export type ServicePhase = 'dawn' | 'day' | 'dusk' | 'night'
export interface ServiceDefinition {
  need: ServiceNeedId
  slots: number
  gainPerSecond: number
  priority: number
  activePhases: ServicePhase[]
  supplyResource: ResourceId | null
  supplyCapacity: number
  supplySecondsPerUnit: number
}
export interface ProductionDefinition {
  inputResource: ResourceId
  inputAmount: number
  inputCapacity: number
  outputResource: ResourceId
  outputAmount: number
  outputCapacity: number
  cycleSeconds: number
  activePhases: ServicePhase[]
}

export type BuildingId =
  | 'house' | 'stockpile' | 'guard-post' | 'wood-wall' | 'wood-gate'
  | 'campfire' | 'tavern' | 'brewery'

export interface BuildingDefinition {
  id: BuildingId
  label: string
  footprint: number
  buildCost: Inventory
  constructionWork: number
  housing: number
  storage: number
  guardSlots: number
  service: ServiceDefinition | null
  production: ProductionDefinition | null
  maxHealth: number
  fortification: boolean
  friendlyPassable: boolean
  color: number
}

const cost = (wood: number): Inventory => ({ wood, food: 0, ale: 0 })

export const BUILDINGS: Record<BuildingId, BuildingDefinition> = {
  house: {
    id: 'house', label: 'House', footprint: 3, buildCost: cost(20),
    constructionWork: 12, housing: 4, storage: 0, guardSlots: 0,
    service: null, production: null, maxHealth: 180,
    fortification: false, friendlyPassable: false, color: 0xb89973,
  },
  stockpile: {
    id: 'stockpile', label: 'Stockpile', footprint: 3, buildCost: cost(10),
    constructionWork: 8, housing: 0, storage: 400, guardSlots: 0,
    service: null, production: null, maxHealth: 220,
    fortification: false, friendlyPassable: false, color: 0x8a9eaa,
  },
  'guard-post': {
    id: 'guard-post', label: 'Guard Post', footprint: 3, buildCost: cost(25),
    constructionWork: 10, housing: 0, storage: 0, guardSlots: 2,
    service: null, production: null, maxHealth: 200,
    fortification: false, friendlyPassable: false, color: 0x8e6b58,
  },
  'wood-wall': {
    id: 'wood-wall', label: 'Wooden Wall', footprint: 1, buildCost: cost(5),
    constructionWork: 3, housing: 0, storage: 0, guardSlots: 0,
    service: null, production: null, maxHealth: 120,
    fortification: true, friendlyPassable: false, color: 0x6f543d,
  },
  'wood-gate': {
    id: 'wood-gate', label: 'Wooden Gate', footprint: 1, buildCost: cost(15),
    constructionWork: 6, housing: 0, storage: 0, guardSlots: 0,
    service: null, production: null, maxHealth: 220,
    fortification: true, friendlyPassable: true, color: 0x8a6847,
  },
  campfire: {
    id: 'campfire', label: 'Campfire', footprint: 1, buildCost: cost(10),
    constructionWork: 4, housing: 0, storage: 0, guardSlots: 0,
    service: {
      need: 'recreation', slots: 6, gainPerSecond: 4, priority: 1,
      activePhases: ['dusk', 'dawn'], supplyResource: null, supplyCapacity: 0, supplySecondsPerUnit: 0,
    },
    production: null, maxHealth: 90,
    fortification: false, friendlyPassable: false, color: 0x7b5a3d,
  },
  tavern: {
    id: 'tavern', label: 'Tavern', footprint: 3, buildCost: cost(40),
    constructionWork: 16, housing: 0, storage: 0, guardSlots: 0,
    service: {
      need: 'recreation', slots: 12, gainPerSecond: 8, priority: 2,
      activePhases: ['dusk', 'dawn'], supplyResource: 'ale', supplyCapacity: 12, supplySecondsPerUnit: 15,
    },
    production: null, maxHealth: 220,
    fortification: false, friendlyPassable: false, color: 0x9d744f,
  },
  brewery: {
    id: 'brewery', label: 'Brewery', footprint: 3, buildCost: cost(35),
    constructionWork: 14, housing: 0, storage: 0, guardSlots: 0,
    service: null,
    production: {
      inputResource: 'food', inputAmount: 2, inputCapacity: 20,
      outputResource: 'ale', outputAmount: 4, outputCapacity: 24,
      cycleSeconds: 12, activePhases: ['day'],
    },
    maxHealth: 210, fortification: false, friendlyPassable: false, color: 0x8b6848,
  },
}
