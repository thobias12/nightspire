import type { Building } from '../model/WorldState'

export type ConstructionVisualStage = 'foundation' | 'frame' | 'shell' | 'complete'
export type DamageVisualStage = 'intact' | 'worn' | 'damaged' | 'critical' | 'ruin'

export interface AtmosphereState {
  daylight: number
  night: number
  twilight: number
  sunIntensity: number
  moonIntensity: number
  ambientIntensity: number
  fogNear: number
  fogFar: number
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))

export function constructionVisualStage(work: number, total: number, complete: boolean): ConstructionVisualStage {
  if (complete) return 'complete'
  const ratio = total > 0 ? clamp01(work / total) : 0
  if (ratio < 0.25) return 'foundation'
  if (ratio < 0.7) return 'frame'
  return 'shell'
}

export function damageVisualStage(health: number, maxHealth: number, destroyed: boolean): DamageVisualStage {
  if (destroyed || health <= 0) return 'ruin'
  const ratio = maxHealth > 0 ? clamp01(health / maxHealth) : 0
  if (ratio <= 0.2) return 'critical'
  if (ratio <= 0.5) return 'damaged'
  if (ratio <= 0.8) return 'worn'
  return 'intact'
}

/** Unfinished blueprints start with zero health; that does not make them ruins. */
export function buildingDamageVisualStage(building: Building): DamageVisualStage {
  return !building.complete && !building.destroyed ? 'intact'
    : damageVisualStage(building.health,building.maxHealth,building.destroyed)
}

export function atmosphereForTime(timeOfDay: number): AtmosphereState {
  const t = ((timeOfDay % 1) + 1) % 1
  const sunWave = Math.sin(t * Math.PI * 2 - Math.PI / 2)
  const daylight = clamp01((sunWave + 0.12) / 1.12)
  const night = clamp01(1 - daylight)

  const dawnDistance = Math.abs(t - 5.5 / 24)
  const duskDistance = Math.abs(t - 19 / 24)
  const wrappedDawn = Math.min(dawnDistance, 1 - dawnDistance)
  const wrappedDusk = Math.min(duskDistance, 1 - duskDistance)
  const twilight = clamp01(1 - Math.min(wrappedDawn, wrappedDusk) / (1.75 / 24))

  return {
    daylight,
    night,
    twilight,
    sunIntensity: 0.14 + daylight * 2.36 + twilight * 0.22,
    moonIntensity: 0.22 + night * 1.23,
    ambientIntensity: 0.72 + daylight * 0.76 + twilight * 0.08,
    fogNear: 54 + daylight * 14,
    fogFar: 120 + daylight * 24,
  }
}
