import { BUILDINGS } from '../../data/buildings'
import { RESOURCE_IDS } from '../../data/resources'
import { entrance, inBounds } from '../../world/Navigation'
import type { Building, Point } from '../../model/WorldState'

export type ConstructionStage = 'site' | 'foundation' | 'frame' | 'scaffold' | 'shell' | 'finishing' | 'complete'

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))

export function constructionMaterialRatio(building: Building): number {
  const cost = BUILDINGS[building.type].buildCost
  const total = RESOURCE_IDS.reduce((sum, resource) => sum + cost[resource], 0)
  if (total <= 0) return 1
  const delivered = RESOURCE_IDS.reduce(
    (sum, resource) => sum + Math.min(cost[resource], building.delivered[resource]),
    0,
  )
  return clamp01(delivered / total)
}

export function constructionProgressRatio(building: Building): number {
  const total = BUILDINGS[building.type].constructionWork
  return total > 0 ? clamp01(building.work / total) : 1
}

/**
 * Construction is physically gated by material delivery. A builder may only
 * advance the structure as far as the fraction of its materials already on site.
 * This lets hauling and building overlap without allowing work to create matter.
 */
export function constructionWorkLimit(building: Building): number {
  return BUILDINGS[building.type].constructionWork * constructionMaterialRatio(building)
}

export function canAdvanceConstruction(building: Building): boolean {
  return !building.complete
    && constructionMaterialRatio(building) > 0
    && building.work + 1e-8 < constructionWorkLimit(building)
}

export function constructionCrewCapacity(building: Building): number {
  const def = BUILDINGS[building.type]
  if (def.fortification || def.footprint <= 1 || def.constructionWork < 8) return 1
  return 2
}

export function constructionStage(building: Building): ConstructionStage {
  if (building.complete) return 'complete'
  const ratio = constructionProgressRatio(building)
  if (ratio <= 1e-8) return 'site'
  if (ratio < 0.2) return 'foundation'
  if (ratio < 0.45) return 'frame'
  if (ratio < 0.65) return 'scaffold'
  if (ratio < 0.85) return 'shell'
  return 'finishing'
}

export function constructionStageLabel(building: Building): string {
  const stage = constructionStage(building)
  if (stage === 'site') return 'Preparing site'
  if (stage === 'foundation') return 'Laying foundation'
  if (stage === 'frame') return 'Raising timber frame'
  if (stage === 'scaffold') return 'Working from scaffolds'
  if (stage === 'shell') return 'Closing the shell'
  if (stage === 'finishing') return 'Finishing structure'
  return 'Complete'
}

/**
 * Builders occupy deterministic perimeter work points rather than stacking at
 * the front door. Points stay outside the blocked blueprint footprint.
 */
export function constructionWorkPoint(building: Building, settlerId: number): Point {
  const half = Math.floor(BUILDINGS[building.type].footprint / 2) + 1
  const points: Point[] = [
    { x: building.x - half, z: building.z },
    { x: building.x + half, z: building.z },
    { x: building.x, z: building.z - half },
    { x: building.x, z: building.z + half },
  ]
  const start = Math.abs(settlerId) % points.length
  for (let i = 0; i < points.length; i++) {
    const candidate = points[(start + i) % points.length]
    if (inBounds(candidate)) return candidate
  }
  return entrance(building)
}
