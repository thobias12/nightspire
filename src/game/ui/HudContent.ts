import type { BuildingId } from '../data/buildings'
import { settlerLabel, type Settler, type WorldState } from '../model/WorldState'

export const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
export const needLabel = (value: string) => value[0].toUpperCase() + value.slice(1)
export const percentage = (value: number, max: number): number => max <= 0 ? 0 : Math.max(0, Math.min(100, Math.round(value / max * 100)))
export const BUILDING_DESCRIPTIONS: Record<BuildingId, string> = {
  house: 'A household plot that shelters settlers and grows in prosperity when nearby services and safety remain strong.',
  stockpile: 'A general logistics yard where haulers collect and deposit settlement resources.',
  'guard-post': 'A staffed defensive post that anchors settlement safety and gives guards a place to stand watch.',
  'wood-wall': 'A simple timber fortification that blocks movement and channels attackers toward controlled approaches.',
  'wood-gate': 'A controlled opening in the settlement wall. Friendly settlers may pass while raiders are forced to breach it.',
  campfire: 'A small communal gathering place that restores recreation around dawn and dusk.',
  tavern: 'A social service building where settlers spend Ale for stronger recreation and evening activity.',
  brewery: 'A staffed workshop that turns Food into Ale during the working day.',
  blacksmith: 'A staffed workshop that turns Ore into Tools, improving the settlement economy and labor output.',
  market: 'A staffed food-distribution hub that supplies nearby households with daily meals.',
  'trading-post': 'A staffed regional trade hub that stores cargo, manages import/export policies and receives visiting merchants.',
  farmhouse: 'The center of local agriculture. Farmers sow nearby fields, harvest crops and return Food to the farm store.',
  'foresters-lodge': 'A staffed woodland workplace. Foresters fell nearby mature trees and replant managed saplings that mature over several days.',
  mine: 'A staffed extraction site that works nearby Ore deposits and buffers mined Ore for settlement haulers.',
  'ore-yard': 'A dedicated high-capacity Ore logistics yard. It accepts Ore only, keeping heavy mineral hauling separate from general stockpiles.',
  'fishing-hut': 'A staffed renewable food workplace. Fishers steadily land Food during the working day without exhausting inland forage.',
  'pleasure-house': 'A staffed mature recreation service for late evening and night. It consumes Ale and provides the strongest recreation service while the settlement is safe.',
}
export interface CatalogPreview {
  title: string
  category: string
  description: string
  detail: string
  requirement: string
  art: string
  planned?: boolean
}

export const PLANNING_CATALOG_PREVIEWS: Record<string, CatalogPreview> = {
  road: {
    title: 'Road',
    category: 'Planning',
    description: 'Draw an organic road point by point. Roads define frontage, connect the settlement and guide future construction.',
    detail: 'Point-drawn · curved or straight · shared planning grid',
    requirement: 'Place freely. Existing roads can be joined and extended.',
    art: 'build-road',
  },
  'residential-plot': {
    title: 'Residential Plot',
    category: 'Planning',
    description: 'Designate a road-fronted household parcel. The planned house and extension footprint remain visible before construction.',
    detail: 'Road-fronted parcel · household progression',
    requirement: 'Must connect to a road frontage.',
    art: 'build-residential-plot',
  },
  field: {
    title: 'Farm Field',
    category: 'Planning',
    description: 'Draw an irregular crop parcel for a nearby Farmhouse. Farmers sow, grow and harvest Food from assigned fields.',
    detail: 'Irregular parcel · seasonal field work',
    requirement: 'Must be within 18m of a complete Farmhouse.',
    art: 'build-field',
  },
}

export const PLANNED_CATALOG_PREVIEWS: Record<string, CatalogPreview> = {
  'build-granary': { title: 'Granary', category: 'Logistics', description: 'Dedicated food storage and distribution support for larger settlements.', detail: 'Food logistics · planned progression', requirement: 'Planned feature.', art: 'build-granary', planned: true },
  'build-bakery': { title: 'Bakery', category: 'Industry', description: 'A later food-processing workplace intended to turn agricultural inputs into higher-value provisions.', detail: 'Processed food · planned production chain', requirement: 'Planned feature.', art: 'build-bakery', planned: true },
  'build-quarry': { title: 'Quarry', category: 'Industry', description: 'Extract Stone for heavier civic and defensive construction in later settlement tiers.', detail: 'Stone extraction · planned resource chain', requirement: 'Planned feature.', art: 'build-quarry', planned: true },
  'build-well': { title: 'Well', category: 'Services', description: 'A neighborhood water service intended to support household quality and future settlement needs.', detail: 'Water service · planned household need', requirement: 'Planned feature.', art: 'build-well', planned: true },
  'build-chapel': { title: 'Chapel', category: 'Services', description: 'A faith and community service building for later settlement progression.', detail: 'Faith service · planned progression', requirement: 'Planned feature.', art: 'build-chapel', planned: true },
  'build-bathhouse': { title: 'Bathhouse', category: 'Services', description: 'A higher-tier hygiene and luxury service for prosperous neighborhoods.', detail: 'Hygiene · luxury · planned service', requirement: 'Planned feature.', art: 'build-bathhouse', planned: true },
  'build-manor': { title: 'Manor', category: 'Services', description: 'A civic centerpiece for higher settlement status, administration and future progression.', detail: 'Civic progression · planned landmark', requirement: 'Planned feature.', art: 'build-manor', planned: true },
  'build-watchtower': { title: 'Watchtower', category: 'Defense', description: 'A later defensive structure intended to extend warning and ranged protection around the settlement.', detail: 'Ranged defense · planned fortification', requirement: 'Planned feature.', art: 'build-watchtower', planned: true },
  'build-barracks': { title: 'Barracks', category: 'Defense', description: 'A dedicated military building for organizing and supporting a larger permanent defense force.', detail: 'Military staffing · planned defense', requirement: 'Planned feature.', art: 'build-barracks', planned: true },
}

const portraitAsset = (settler: Settler): string => 'portrait:settler-' + ((settler.id % 8) + 1)
export const personCard = (state: WorldState, settler: Settler, role: string, action = ''): string =>
  '<div class="person-card" title="' + escape(settler.status) + '">'
  + '<span class="portrait-slot" data-ui-asset="' + portraitAsset(settler) + '" aria-hidden="true"></span>'
  + '<span class="person-copy"><b>' + escape(settlerLabel(state, settler.id)) + '</b><small>' + escape(role) + '</small></span>'
  + action
  + '</div>'
export const emptyPersonCard = (label: string): string =>
  '<div class="person-card is-empty"><span class="portrait-slot" data-ui-asset="portrait:worker-empty" aria-hidden="true">+</span><span class="person-copy"><b>Empty</b><small>' + escape(label) + '</small></span></div>'
export const needMeter = (label: string, value: number, asset: string): string =>
  '<div class="need-meter"><div class="need-meter-label"><span data-ui-asset="' + asset + '"></span><b>' + escape(label) + '</b><em>' + Math.round(value) + '%</em></div><div class="need-meter-track"><i style="width:' + percentage(value, 100) + '%"></i></div></div>'
export const contextualPanel = (
  eyebrow: string,
  title: string,
  asset: string,
  body: string,
  tone: 'neutral' | 'danger' = 'neutral',
): string =>
  '<div class="object-panel object-panel-' + tone + '">'
  + '<div class="object-panel-title" data-drag-handle>'
  + '<span class="object-panel-icon" data-ui-asset="' + asset + '" aria-hidden="true"></span>'
  + '<div><span class="eyebrow">' + escape(eyebrow) + '</span><h2>' + escape(title) + '</h2></div>'
  + '<button class="context-close" data-action="close-inspector" title="Close">×</button>'
  + '</div>'
  + '<div class="object-panel-body">' + body + '</div>'
  + '</div>'

