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
  utilityIcons: ['settlement-overview', 'selection', 'developer', 'tasks-messages', 'time-pause'],
  buildingCards: ['road', 'residential-plot', 'field', 'stockpile', 'farmhouse', 'brewery', 'campfire', 'tavern', 'blacksmith', 'market', 'trading-post', 'guard-post', 'wood-wall', 'wood-gate'],
  plannedBuildingCards: ['granary', 'bakery', 'quarry', 'mine', 'well', 'chapel', 'bathhouse', 'pleasure-house', 'manor', 'watchtower', 'barracks'],
  planningUtilities: ['grid-snap'],
  buildingHeaders: ['house', 'stockpile', 'guard-post', 'wood-wall', 'wood-gate', 'campfire', 'tavern', 'brewery', 'blacksmith', 'market', 'trading-post', 'farmhouse'],
  buildingIcons: ['house', 'stockpile', 'guard-post', 'wood-wall', 'wood-gate', 'campfire', 'tavern', 'brewery', 'blacksmith', 'market', 'trading-post', 'farmhouse'],
  portraits: ['settler-1', 'settler-2', 'settler-3', 'settler-4', 'settler-5', 'settler-6', 'settler-7', 'settler-8', 'worker-empty', 'raider'],
  services: ['food', 'housing', 'safety', 'recreation', 'agriculture'],
  notifications: ['task-raid', 'task-housing', 'task-food', 'task-storage', 'task-repair', 'task-trade', 'task-arrival', 'task-event'],
  minimap: ['building', 'field', 'settler', 'hostile', 'road'],
} as const
