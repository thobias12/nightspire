export type ResourceId = 'wood' | 'food'
export type Inventory = Record<ResourceId, number>
export const emptyInventory = (): Inventory => ({ wood: 0, food: 0 })
export const RESOURCES = {
  wood: { label: 'Wood', workSeconds: 3, batch: 5, color: 0xa87849 },
  food: { label: 'Food', workSeconds: 2, batch: 5, color: 0xda9665 },
} as const
export const RESOURCE_IDS: ResourceId[] = ['wood', 'food']
