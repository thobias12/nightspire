export type ResourceId = 'wood' | 'stone' | 'food' | 'iron' | 'coin'

export interface ResourceDefinition {
  id: ResourceId
  label: string
}

export const RESOURCES: readonly ResourceDefinition[] = [
  { id: 'wood', label: 'Wood' },
  { id: 'stone', label: 'Stone' },
  { id: 'food', label: 'Food' },
  { id: 'iron', label: 'Iron' },
  { id: 'coin', label: 'Coin' },
]
