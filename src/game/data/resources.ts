export type ResourceId = 'wood' | 'food' | 'ale'
export type Inventory = Record<ResourceId, number>
export const emptyInventory = (): Inventory => ({ wood: 0, food: 0, ale: 0 })
export const RESOURCES = {
  wood: { label: 'Wood', workSeconds: 3, batch: 5, color: 0xa87849 },
  food: { label: 'Food', workSeconds: 2, batch: 5, color: 0xda9665 },
  ale: { label: 'Ale', workSeconds: 0, batch: 0, color: 0xd6a34f },
} as const
export const RESOURCE_IDS: ResourceId[] = ['wood', 'food', 'ale']
