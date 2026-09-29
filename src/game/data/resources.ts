export type ResourceId = 'wood' | 'food' | 'ale' | 'ore' | 'tools'
export type Inventory = Record<ResourceId, number>
export const emptyInventory = (): Inventory => ({ wood: 0, food: 0, ale: 0, ore: 0, tools: 0 })
export const RESOURCES = {
  wood: { label: 'Wood', workSeconds: 3, batch: 5, color: 0xa87849 },
  food: { label: 'Food', workSeconds: 2, batch: 5, color: 0xda9665 },
  ale: { label: 'Ale', workSeconds: 0, batch: 0, color: 0xd6a34f },
  ore: { label: 'Iron Ore', workSeconds: 4, batch: 5, color: 0x7f8791 },
  tools: { label: 'Tools', workSeconds: 0, batch: 0, color: 0xb8c4cf },
} as const
export const RESOURCE_IDS: ResourceId[] = ['wood', 'food', 'ale', 'ore', 'tools']
export const WOODCUTTING = {
  wildTreeYield: 40,
  managedTreeYield: 18,
  fellStart: 0.42,
  fellEnd: 0.96,
  trunkStageMinRatio: 0.48,
} as const
