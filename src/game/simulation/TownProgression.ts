import type { BuildingId } from '../data/buildings'
import { distance } from './Navigation'
import type { WorldState } from './WorldState'

export type SettlementTierId = 'camp' | 'hamlet' | 'village' | 'town' | 'stronghold'

export interface SettlementTierDefinition {
  id: SettlementTierId
  rank: number
  label: string
}

export interface SettlementMetrics {
  population: number
  houses: number
  establishedHomes: number
  prosperousHomes: number
  roadLength: number
  fortifications: number
  guardPosts: number
  clearedWave: number
  market: boolean
  tavern: boolean
  blacksmith: boolean
  tradingPost: boolean
}

export interface SettlementTierStatus extends SettlementTierDefinition {
  next: SettlementTierDefinition | null
  metrics: SettlementMetrics
  blockers: string[]
}

export const SETTLEMENT_TIERS: SettlementTierDefinition[] = [
  { id: 'camp', rank: 0, label: 'Camp' },
  { id: 'hamlet', rank: 1, label: 'Hamlet' },
  { id: 'village', rank: 2, label: 'Village' },
  { id: 'town', rank: 3, label: 'Town' },
  { id: 'stronghold', rank: 4, label: 'Stronghold' },
]

function completed(state: WorldState, type: BuildingId): number {
  return state.buildings.filter(building => building.type === type && building.complete && !building.destroyed).length
}

export function settlementMetrics(state: WorldState): SettlementMetrics {
  const homes = state.buildings.filter(building => building.type === 'house' && building.complete && !building.destroyed)
  const roadLength = state.roads.reduce((total, road) => {
    let length = 0
    for (let i = 1; i < road.points.length; i++) length += distance(road.points[i - 1], road.points[i])
    return total + length
  }, 0)

  return {
    population: state.settlers.length,
    houses: homes.length,
    establishedHomes: homes.filter(home => home.houseLevel >= 2).length,
    prosperousHomes: homes.filter(home => home.houseLevel >= 3).length,
    roadLength,
    fortifications: state.buildings.filter(building =>
      building.complete && !building.destroyed && (building.type === 'wood-wall' || building.type === 'wood-gate'),
    ).length,
    guardPosts: completed(state, 'guard-post'),
    clearedWave: state.raid.lastClearedWave,
    market: completed(state, 'market') > 0,
    tavern: completed(state, 'tavern') > 0,
    blacksmith: completed(state, 'blacksmith') > 0,
    tradingPost: completed(state, 'trading-post') > 0,
  }
}

function hamlet(metrics: SettlementMetrics): boolean {
  return metrics.population >= 6 && metrics.houses >= 1
}

function village(metrics: SettlementMetrics): boolean {
  return hamlet(metrics)
    && metrics.houses >= 2
    && metrics.roadLength >= 6
    && (metrics.market || metrics.tavern)
}

function town(metrics: SettlementMetrics): boolean {
  return village(metrics)
    && metrics.establishedHomes >= 1
    && metrics.roadLength >= 14
    && metrics.market
    && metrics.blacksmith
    && metrics.tradingPost
}

function stronghold(metrics: SettlementMetrics): boolean {
  return town(metrics)
    && metrics.prosperousHomes >= 1
    && metrics.fortifications >= 8
    && metrics.guardPosts >= 1
    && metrics.clearedWave >= 2
}

export function settlementTier(state: WorldState): SettlementTierDefinition {
  const metrics = settlementMetrics(state)
  if (stronghold(metrics)) return SETTLEMENT_TIERS[4]
  if (town(metrics)) return SETTLEMENT_TIERS[3]
  if (village(metrics)) return SETTLEMENT_TIERS[2]
  if (hamlet(metrics)) return SETTLEMENT_TIERS[1]
  return SETTLEMENT_TIERS[0]
}

function blockersFor(next: SettlementTierId, metrics: SettlementMetrics): string[] {
  const blockers: string[] = []
  if (next === 'hamlet') {
    if (metrics.population < 6) blockers.push('Need 6 residents')
    if (metrics.houses < 1) blockers.push('Need a completed House')
  } else if (next === 'village') {
    if (metrics.houses < 2) blockers.push('Need 2 completed Houses')
    if (metrics.roadLength < 6) blockers.push('Need 6m of roads')
    if (!metrics.market && !metrics.tavern) blockers.push('Need a Market or Tavern')
  } else if (next === 'town') {
    if (metrics.establishedHomes < 1) blockers.push('Need an Established Home')
    if (metrics.roadLength < 14) blockers.push('Need 14m of roads')
    if (!metrics.market) blockers.push('Need a Market')
    if (!metrics.blacksmith) blockers.push('Need a Blacksmith')
    if (!metrics.tradingPost) blockers.push('Need a Trading Post')
  } else if (next === 'stronghold') {
    if (metrics.prosperousHomes < 1) blockers.push('Need a Prosperous Home')
    if (metrics.fortifications < 8) blockers.push('Need 8 completed fortification segments')
    if (metrics.guardPosts < 1) blockers.push('Need a Guard Post')
    if (metrics.clearedWave < 2) blockers.push('Clear Raid 2')
  }
  return blockers
}

export function settlementTierStatus(state: WorldState): SettlementTierStatus {
  const metrics = settlementMetrics(state)
  const tier = settlementTier(state)
  const next = SETTLEMENT_TIERS[tier.rank + 1] ?? null
  return {
    ...tier,
    next,
    metrics,
    blockers: next ? blockersFor(next.id, metrics) : [],
  }
}
