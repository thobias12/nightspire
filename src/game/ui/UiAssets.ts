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
 * Logical HUD asset inventory. The active manuscript stylesheet binds these
 * slots to canonical scenes/portraits and reusable SVG emblems. uiAsset() keeps
 * the legacy path helper for tooling; it does not choose the live HUD artwork.
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
  buildingCards: ['road', 'residential-plot', 'field', 'stockpile', 'ore-yard', 'farmhouse', 'foresters-lodge', 'mine', 'fishing-hut', 'brewery', 'campfire', 'tavern', 'pleasure-house', 'blacksmith', 'market', 'trading-post', 'guard-post', 'wood-wall', 'wood-gate'],
  plannedBuildingCards: ['granary', 'bakery', 'quarry', 'well', 'chapel', 'bathhouse', 'manor', 'watchtower', 'barracks'],
  planningUtilities: ['grid-snap'],
  buildingHeaders: ['house', 'stockpile', 'ore-yard', 'guard-post', 'wood-wall', 'wood-gate', 'campfire', 'tavern', 'pleasure-house', 'brewery', 'blacksmith', 'market', 'trading-post', 'farmhouse', 'foresters-lodge', 'mine', 'fishing-hut'],
  buildingIcons: ['house', 'stockpile', 'ore-yard', 'guard-post', 'wood-wall', 'wood-gate', 'campfire', 'tavern', 'pleasure-house', 'brewery', 'blacksmith', 'market', 'trading-post', 'farmhouse', 'foresters-lodge', 'mine', 'fishing-hut'],
  portraits: ['settler-1', 'settler-2', 'settler-3', 'settler-4', 'settler-5', 'settler-6', 'settler-7', 'settler-8', 'worker-empty', 'raider'],
  services: ['food', 'housing', 'safety', 'recreation', 'agriculture'],
  notifications: ['task-raid', 'task-housing', 'task-food', 'task-storage', 'task-repair', 'task-trade', 'task-arrival', 'task-event'],
  minimap: ['building', 'field', 'settler', 'hostile', 'road'],
} as const
