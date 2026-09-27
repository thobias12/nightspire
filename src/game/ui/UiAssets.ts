export const UI_ASSET_ROOT = 'assets/ui'

export type UiAssetKind =
  | 'crest'
  | 'resource'
  | 'command'
  | 'category'
  | 'building-card'
  | 'building-header'
  | 'building-icon'
  | 'portrait'
  | 'notification'
  | 'service'
  | 'minimap'

export interface UiAssetDescriptor {
  kind: UiAssetKind
  name: string
  path: string
}

/**
 * Stable path contract for future Astra-generated UI artwork.
 * Missing files are intentional during the shell phase: the HUD renders
 * styled placeholders from data-ui-asset / data-art-slot attributes.
 */
export function uiAsset(kind: UiAssetKind, name: string, extension = 'webp'): UiAssetDescriptor {
  return { kind, name, path: `${UI_ASSET_ROOT}/${kind}/${name}.${extension}` }
}

export const CURRENT_UI_ASSETS = {
  crest: ['nightspire'],
  resources: ['wood', 'food', 'ale', 'ore', 'tools', 'gold'],
  categories: ['planning', 'logistics', 'industry', 'services', 'defense'],
  commands: ['build', 'rotate', 'inspect', 'camera', 'street-view', 'center', 'save', 'load'],
  buildingCards: ['road', 'residential-plot', 'field', 'stockpile', 'farmhouse', 'brewery', 'tavern', 'blacksmith', 'market', 'trading-post', 'guard-post'],
  buildingHeaders: ['house', 'stockpile', 'guard-post', 'wood-wall', 'wood-gate', 'campfire', 'tavern', 'brewery', 'blacksmith', 'market', 'trading-post', 'farmhouse'],
  notifications: ['task-raid', 'task-housing', 'task-food', 'task-storage', 'task-repair', 'task-trade', 'task-arrival', 'task-event'],
  minimap: ['building', 'field', 'settler', 'hostile', 'road'],
} as const
