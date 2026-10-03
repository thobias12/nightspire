import { BUILDINGS, type BuildingId } from '../data/buildings'
import { RESOURCES } from '../data/resources'
import {
  BUILDING_DESCRIPTIONS,
  PLANNED_CATALOG_PREVIEWS,
  PLANNING_CATALOG_PREVIEWS,
  type CatalogPreview,
} from './HudContent'

export interface CatalogSeal {
  icon: string
  label: string
}

// Presentation only: these describe existing tools and planned catalog entries,
// without adding resources, services or production rules to the simulation.
const NON_BUILDING_SEALS: Record<string, CatalogSeal> = {
  'build-road': { icon: 'road', label: 'Road connection' },
  'build-residential-plot': { icon: 'housing', label: 'Housing' },
  'build-field': { icon: 'agriculture', label: 'Food harvest' },
  'build-granary': { icon: 'food', label: 'Food storage (planned)' },
  'build-bakery': { icon: 'food', label: 'Food production (planned)' },
  'build-quarry': { icon: 'stone', label: 'Stone extraction (planned)' },
  'build-well': { icon: 'water', label: 'Water service (planned)' },
  'build-chapel': { icon: 'faith', label: 'Faith service (planned)' },
  'build-bathhouse': { icon: 'hygiene', label: 'Hygiene service (planned)' },
  'build-manor': { icon: 'civic', label: 'Civic administration (planned)' },
  'build-watchtower': { icon: 'defense', label: 'Defense (planned)' },
  'build-barracks': { icon: 'military', label: 'Military (planned)' },
}

/** Read a producer's actual output, never its input or construction cost. */
export function catalogSealFor(art: string, buildingType?: BuildingId): CatalogSeal | null {
  if (!buildingType) return NON_BUILDING_SEALS[art] ?? null
  const def = BUILDINGS[buildingType]
  const output = def.production?.outputResource ?? def.resourceOperation?.resource
  if (output) {
    const fish = buildingType === 'fishing-hut' && output === 'food'
    return { icon: fish ? 'fish' : output, label: 'Produces ' + RESOURCES[output].label + (fish ? ' (fish)' : '') }
  }
  if (def.agricultureStorageCapacity) return { icon: 'agriculture', label: 'Food harvest' }
  if (def.foodDistribution) return { icon: def.foodDistribution.resource, label: 'Food distribution' }
  if (def.housing > 0) return { icon: 'housing', label: 'Housing' }
  if (def.storage > 0) {
    const onlyResource = def.storageResources?.length === 1 ? def.storageResources[0] : null
    return onlyResource
      ? { icon: onlyResource, label: RESOURCES[onlyResource].label + ' storage' }
      : { icon: 'storage', label: 'Resource storage' }
  }
  if (def.tradeStorageCapacity) return { icon: 'trade', label: 'Trade' }
  if (def.service) return {
    icon: buildingType === 'campfire' ? 'fire' : buildingType === 'tavern' ? 'ale' : def.service.need,
    label: 'Recreation service',
  }
  if (def.guardSlots > 0 || def.fortification) return { icon: 'safety', label: 'Defense' }
  return null
}

export function catalogPreviewFor(card: HTMLButtonElement): CatalogPreview | null {
  const buildingType = card.dataset.buildingType as BuildingId | undefined
  if (buildingType) {
    const def = BUILDINGS[buildingType]
    const detailParts = [def.buildCost.wood + ' Wood', def.footprint + 'm footprint']
    if ((def.workerSlots ?? 0) > 0) detailParts.push((def.workerSlots ?? 0) + ' ' + (def.profession ?? 'Worker') + ((def.workerSlots ?? 0) === 1 ? '' : 's'))
    if (def.guardSlots > 0) detailParts.push(def.guardSlots + ' Guard slots')
    if (def.storage > 0) detailParts.push(def.storage + ' storage')
    if (def.tradeStorageCapacity) detailParts.push(def.tradeStorageCapacity + ' trade storage')
    if (def.agricultureStorageCapacity) detailParts.push(def.agricultureStorageCapacity + ' Food storage')
    if (def.production) {
      detailParts.push(RESOURCES[def.production.inputResource].label + ' → ' + RESOURCES[def.production.outputResource].label)
    } else if (def.resourceOperation) {
      detailParts.push((def.resourceOperation.renewable ? 'Renewable ' : '') + RESOURCES[def.resourceOperation.resource].label + ' operation')
      if (def.resourceOperation.replant) detailParts.push('Replants saplings')
    } else if (def.service) {
      detailParts.push(def.service.slots + ' visitor slots')
    } else if (def.foodDistribution) {
      detailParts.push(def.foodDistribution.mealsPerWorkerPerDay + ' meals / Vendor / Day')
    }

    let requirement = def.fortification ? 'Free defensive placement.' : 'Requires road frontage.'
    if (buildingType === 'farmhouse') requirement += ' Fields must be within 18m of the Farmhouse.'

    return {
      title: def.label,
      category: def.fortification ? 'Defense' : def.production || def.resourceOperation ? 'Industry' : def.service || def.foodDistribution ? 'Services' : buildingType === 'stockpile' || buildingType === 'trading-post' || buildingType === 'ore-yard' ? 'Logistics' : 'Construction',
      description: BUILDING_DESCRIPTIONS[buildingType],
      detail: detailParts.join(' · '),
      requirement,
      art: card.querySelector<HTMLElement>('[data-art-slot]')?.dataset.artSlot ?? 'build-' + buildingType,
    }
  }

  const action = card.dataset.action
  if (action && PLANNING_CATALOG_PREVIEWS[action]) return PLANNING_CATALOG_PREVIEWS[action]

  const art = card.querySelector<HTMLElement>('[data-art-slot]')?.dataset.artSlot
  if (art && PLANNED_CATALOG_PREVIEWS[art]) return PLANNED_CATALOG_PREVIEWS[art]
  return null
}

/** Static output/category seals. Construction costs remain in hover previews. */
export function decorateCatalogCards(element: HTMLElement): void {
  for (const card of element.querySelectorAll<HTMLButtonElement>('.build-card')) {
    const name = card.querySelector('.build-name')?.textContent ?? ''
    card.setAttribute('aria-label', name + (card.classList.contains('is-planned') ? ' (planned)' : ''))
    const type = card.dataset.buildingType as BuildingId | undefined
    const art = card.querySelector<HTMLElement>('[data-art-slot]')?.dataset.artSlot ?? ''
    const seal = catalogSealFor(art, type)
    card.title = name + (card.title ? ' · ' + card.title : '') + (seal ? ' · ' + seal.label : '')
    if (!seal) continue
    const badge = document.createElement('span')
    badge.className = 'card-seal'
    badge.title = seal.label
    badge.setAttribute('aria-hidden', 'true')
    // A description exposes the meaning without changing the card's name or
    // making its decorative icon an extra keyboard/screen-reader stop.
    card.setAttribute('aria-description', seal.label)
    badge.innerHTML = '<span data-icon-slot="catalog-' + seal.icon + '"></span>'
    card.append(badge)
  }
}
