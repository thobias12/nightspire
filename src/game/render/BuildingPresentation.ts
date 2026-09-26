import type { BuildingDefinition } from '../data/buildings'
import type { Building } from '../simulation/WorldState'

export type ConstructionVisualStage = 'foundation' | 'frame' | 'finished'
export type DamageVisualState = 'healthy' | 'damaged' | 'critical' | 'ruined'

export function constructionProgress(building: Building, def: BuildingDefinition): number {
  if (building.complete) return 1
  const cost = Math.max(1, def.buildCost.wood + def.buildCost.food + def.buildCost.ale)
  const delivered = building.delivered.wood + building.delivered.food + building.delivered.ale
  const materialProgress = Math.min(1, delivered / cost)
  const workProgress = Math.min(1, Math.max(0, building.work / Math.max(def.constructionWork, 1)))
  return Math.min(0.99, materialProgress * 0.3 + workProgress * 0.7)
}

export function constructionVisualStage(
  building: Building,
  def: BuildingDefinition,
): ConstructionVisualStage {
  if (building.complete) return 'finished'
  return constructionProgress(building, def) < 0.34 ? 'foundation' : 'frame'
}

export function damageVisualState(building: Building): DamageVisualState {
  if (building.destroyed || building.health <= 0) return 'ruined'
  const ratio = building.maxHealth > 0 ? building.health / building.maxHealth : 1
  if (ratio <= 0.28) return 'critical'
  if (ratio < 0.72) return 'damaged'
  return 'healthy'
}

export function nightAmount(timeOfDay: number): number {
  const t = ((timeOfDay % 1) + 1) % 1
  const hour = t * 24
  if (hour >= 20 || hour < 5) return 1
  if (hour >= 18) return (hour - 18) / 2
  if (hour < 6) return Math.min(1, 6 - hour)
  return 0
}
