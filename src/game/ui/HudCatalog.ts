import { BUILDINGS, type BuildingId } from '../data/buildings'
import { RESOURCES } from '../data/resources'
import {
  BUILDING_DESCRIPTIONS,
  PLANNED_CATALOG_PREVIEWS,
  PLANNING_CATALOG_PREVIEWS,
  type CatalogPreview,
} from './HudContent'

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

/** Static shelf dressing. Costs come from the same definitions as placement. */
export function decorateCatalogCards(element: HTMLElement): void {
  for (const card of element.querySelectorAll<HTMLButtonElement>('.build-card')) {
    const name = card.querySelector('.build-name')?.textContent ?? ''
    card.setAttribute('aria-label', name + (card.classList.contains('is-planned') ? ' (planned)' : ''))
    card.title = name + (card.title ? ' · ' + card.title : '')
    const type = card.dataset.buildingType as BuildingId | undefined
    const cost = type ? BUILDINGS[type].buildCost.wood : card.dataset.action === 'residential-plot' ? BUILDINGS.house.buildCost.wood : null
    const badge = document.createElement('span')
    badge.className = 'card-seal'
    badge.setAttribute('aria-hidden', 'true')
    badge.innerHTML = cost !== null
      ? '<span data-icon-slot="resource-wood"></span><b>' + cost + '</b>'
      : '<b>' + (card.classList.contains('is-planned') ? '◇' : card.dataset.action === 'field' ? '❧' : '⌁') + '</b>'
    card.append(badge)
  }
}
