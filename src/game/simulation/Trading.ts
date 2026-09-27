import { RESOURCE_IDS, type ResourceId } from '../data/resources'
import { available, stockpiles } from './Buildings'
import type { JobReservations } from './JobReservations'
import { workplaceStaffing } from './Workforce'
import { recordEvent, type Building, type TradeMode, type WorldState } from './WorldState'

export const TRADE_PRICES: Record<ResourceId, { buy: number; sell: number }> = {
  wood: { buy: 2, sell: 1 },
  food: { buy: 3, sell: 2 },
  ale: { buy: 6, sell: 4 },
  ore: { buy: 5, sell: 3 },
  tools: { buy: 12, sell: 8 },
}

export const MERCHANT_UNIT_LIMIT = 20

export function completedTradingPosts(state: WorldState): Building[] {
  return state.buildings
    .filter(building => building.type === 'trading-post' && building.complete && !building.destroyed)
    .sort((a, b) => a.id - b.id)
}

export function primaryTradingPost(state: WorldState): Building | null {
  return completedTradingPosts(state)[0] ?? null
}

export function tradeStorageCapacity(building: Building): number {
  return building.type === 'trading-post' ? 60 : 0
}

export function tradeStorageUsed(building: Building): number {
  return RESOURCE_IDS.reduce((sum, resource) => sum + building.inventory[resource], 0)
}

export function tradeFreeStorage(state: WorldState, building: Building, index?: JobReservations): number {
  if (building.type !== 'trading-post') return 0
  const incoming = index
    ? index.incoming(building.id)
    : state.jobs
      .filter(job => job.kind === 'supply' && job.targetId === building.id)
      .reduce((sum, job) => sum + job.amount, 0)
  return Math.max(0, tradeStorageCapacity(building) - tradeStorageUsed(building) - incoming)
}

export function nextTradeMode(mode: TradeMode): TradeMode {
  return mode === 'keep' ? 'export' : mode === 'export' ? 'import' : 'keep'
}

export function tradeModeLabel(mode: TradeMode): string {
  return mode === 'keep' ? 'Keep' : mode === 'export' ? 'Export surplus' : 'Import to reserve'
}

export function tradeReputation(state: WorldState): number {
  return state.buildings
    .filter(building => building.type === 'house' && building.complete && !building.destroyed)
    .reduce((sum, house) => sum + (house.houseLevel >= 3 ? 2 : house.houseLevel >= 2 ? 1 : 0), 0)
}

export function merchantIntervalDays(state: WorldState): number {
  return tradeReputation(state) >= 4 ? 2 : 3
}

export function scheduleMerchantVisit(state: WorldState): boolean {
  if (!primaryTradingPost(state) || state.day < state.trade.nextMerchantDay) return false
  state.trade.merchantDay = state.day
  state.trade.visits++
  state.trade.nextMerchantDay = state.day + merchantIntervalDays(state)
  recordEvent(state, 'A merchant caravan has arrived at the Trading Post and will remain through the Day.')
  return true
}

function stockpileAvailableTotal(state: WorldState, resource: ResourceId, index?: JobReservations): number {
  return stockpiles(state).reduce((sum, store) => sum + Math.max(0, available(state, store, resource, index)), 0)
}

export function tradeExportStagingNeed(
  state: WorldState,
  post: Building,
  resource: ResourceId,
  index?: JobReservations,
): number {
  const policy = state.trade.policies[resource]
  if (post.type !== 'trading-post' || policy.mode !== 'export') return 0
  if (workplaceStaffing(state, post).assigned <= 0) return 0
  const surplus = Math.max(0, stockpileAvailableTotal(state, resource, index) - policy.reserve)
  return Math.min(surplus, MERCHANT_UNIT_LIMIT, tradeFreeStorage(state, post, index))
}

export function tradePostPickupAvailable(
  state: WorldState,
  post: Building,
  resource: ResourceId,
  index?: JobReservations,
): number {
  if (post.type !== 'trading-post' || state.trade.policies[resource].mode === 'export') return 0
  const reserved = index ? index.pickup(post.id, resource) : state.jobs
    .filter(job => job.kind === 'supply' && job.sourceId === post.id && job.resource === resource && job.stage === 'source')
    .reduce((sum, job) => sum + job.amount, 0)
  return Math.max(0, post.inventory[resource] - reserved)
}

export function merchantPresent(state: WorldState): boolean {
  return state.trade.merchantDay === state.day
}

export function processMerchantTrade(state: WorldState): boolean {
  if (!merchantPresent(state) || state.trade.lastTransactionDay === state.day) return false
  const post = primaryTradingPost(state)
  if (!post || workplaceStaffing(state, post).active <= 0) return false

  let exportedUnits = 0
  let importedUnits = 0
  let earned = 0
  let spent = 0

  for (const resource of RESOURCE_IDS) {
    const policy = state.trade.policies[resource]
    if (policy.mode !== 'export') continue
    const amount = Math.min(MERCHANT_UNIT_LIMIT, post.inventory[resource])
    if (amount <= 0) continue
    const value = amount * TRADE_PRICES[resource].sell
    post.inventory[resource] -= amount
    state.trade.gold += value
    state.trade.exported[resource] += amount
    state.trade.goldEarned += value
    exportedUnits += amount
    earned += value
  }

  for (const resource of RESOURCE_IDS) {
    const policy = state.trade.policies[resource]
    if (policy.mode !== 'import') continue
    const current = stockpileAvailableTotal(state, resource) + post.inventory[resource]
    const desired = Math.max(0, policy.reserve - current)
    const unitPrice = TRADE_PRICES[resource].buy
    const affordable = Math.floor(state.trade.gold / unitPrice)
    const amount = Math.min(desired, MERCHANT_UNIT_LIMIT, affordable, tradeFreeStorage(state, post))
    if (amount <= 0) continue
    const value = amount * unitPrice
    post.inventory[resource] += amount
    state.trade.gold -= value
    state.trade.imported[resource] += amount
    state.trade.goldSpent += value
    importedUnits += amount
    spent += value
  }

  state.trade.lastTransactionDay = state.day
  recordEvent(
    state,
    'Merchant trade settled: exported ' + exportedUnits + ' units for ' + earned + ' Gold; imported '
      + importedUnits + ' units for ' + spent + ' Gold.',
  )
  return true
}

export function adjustTradeReserve(state: WorldState, resource: ResourceId, delta: number): number {
  const policy = state.trade.policies[resource]
  policy.reserve = Math.max(0, Math.min(500, policy.reserve + delta))
  return policy.reserve
}
