import { BUILDINGS } from '../data/buildings'
import { RESOURCE_IDS } from '../data/resources'
import {
  DEFAULT_IMMIGRATION,
  DEFAULT_NEEDS,
  DEFAULT_RAID,
  DEFAULT_TARGETS,
  defaultTradeState,
} from '../model/WorldState'

function migrateInventory(value: any): void {
  if (!value) return
  for (const resource of RESOURCE_IDS) if (value[resource] === undefined) value[resource] = 0
}

/**
 * Mutates a parsed version-1 save into the current version-1 shape.
 *
 * Save migrations live here so validation remains a strict read-only integrity
 * check. Keep migrations idempotent: deserialize may be called on already-current
 * saves and must not change valid state beyond transient route cleanup.
 */
export function migrateWorldCandidate(candidate: any): void {
  if (!candidate || candidate.version !== 1) return

  if (candidate.targets === undefined) candidate.targets = { ...DEFAULT_TARGETS }
  migrateInventory(candidate.targets)

  if (candidate.trade === undefined) candidate.trade = defaultTradeState()
  if (candidate.trade) {
    const defaults = defaultTradeState()
    if (candidate.trade.gold === undefined) candidate.trade.gold = defaults.gold
    if (candidate.trade.policies === undefined) candidate.trade.policies = defaults.policies
    for (const resource of RESOURCE_IDS) {
      if (candidate.trade.policies[resource] === undefined) candidate.trade.policies[resource] = defaults.policies[resource]
    }
    if (candidate.trade.nextMerchantDay === undefined) candidate.trade.nextMerchantDay = defaults.nextMerchantDay
    if (candidate.trade.merchantDay === undefined) candidate.trade.merchantDay = 0
    if (candidate.trade.lastTransactionDay === undefined) candidate.trade.lastTransactionDay = 0
    if (candidate.trade.visits === undefined) candidate.trade.visits = 0
    if (candidate.trade.goldEarned === undefined) candidate.trade.goldEarned = 0
    if (candidate.trade.goldSpent === undefined) candidate.trade.goldSpent = 0
    if (candidate.trade.imported === undefined) candidate.trade.imported = defaults.imported
    if (candidate.trade.exported === undefined) candidate.trade.exported = defaults.exported
    migrateInventory(candidate.trade.imported)
    migrateInventory(candidate.trade.exported)
  }

  if (candidate.roads === undefined) candidate.roads = []
  if (candidate.residentialPlots === undefined) candidate.residentialPlots = []
  if (candidate.fields === undefined) candidate.fields = []

  if (Array.isArray(candidate.settlers)) {
    for (const settler of candidate.settlers) {
      if (settler.role === undefined) settler.role = 'worker'
      if (settler.workplaceId === undefined) settler.workplaceId = null
      if (settler.health === undefined) Object.assign(settler, { health: 100, maxHealth: 100, attackCooldown: 0 })
      if (settler.lastHitTick === undefined) settler.lastHitTick = 0
      if (settler.needs === undefined) settler.needs = { ...DEFAULT_NEEDS }
      if (settler.lastMealDay === undefined) settler.lastMealDay = Math.max(0, candidate.day - 1)
      if (settler.arrivalTarget === undefined) settler.arrivalTarget = null
      migrateInventory(settler.cargo)
    }
  }

  if (candidate.player?.health === undefined) {
    Object.assign(candidate.player, { health: 100, maxHealth: 100, attackCooldown: 0 })
  }
  if (candidate.player?.lastHitTick === undefined) candidate.player.lastHitTick = 0

  if (candidate.enemies === undefined) candidate.enemies = []
  if (Array.isArray(candidate.enemies)) {
    for (const enemy of candidate.enemies) {
      if (enemy.health === undefined) Object.assign(enemy, { health: 40, maxHealth: 40, attackCooldown: 0 })
      if (enemy.lastHitTick === undefined) enemy.lastHitTick = 0
    }
  }

  if (Array.isArray(candidate.buildings)) {
    for (const building of candidate.buildings) {
      const def = BUILDINGS[building.type as keyof typeof BUILDINGS]
      if (!def) continue
      if (building.maxHealth === undefined) building.maxHealth = def.maxHealth
      if (building.health === undefined) building.health = building.complete ? def.maxHealth : 0
      if (building.destroyed === undefined) building.destroyed = false
      if (building.lastHitTick === undefined) building.lastHitTick = 0
      if (building.serviceProgress === undefined) building.serviceProgress = 0
      if (building.productionProgress === undefined) building.productionProgress = 0
      if (building.distributionDay === undefined) building.distributionDay = 0
      if (building.distributionServed === undefined) building.distributionServed = 0
      if (building.houseLevel === undefined) building.houseLevel = building.type === 'house' ? 1 : 0
      if (building.houseQualifyingDays === undefined) building.houseQualifyingDays = 0
      if (building.houseLastEvaluationDay === undefined) building.houseLastEvaluationDay = 0
      if (building.haulPriority === undefined) building.haulPriority = 'normal'
      if (building.stockpilePriority === undefined) building.stockpilePriority = 'normal'
      if (building.stockpileFilters === undefined) {
        building.stockpileFilters = { wood: true, food: true, ale: true, ore: true, tools: true }
      }
      if (building.rotation === undefined) building.rotation = 0
      migrateInventory(building.inventory)
      migrateInventory(building.delivered)

      // Pre-Ale saves used Food as Tavern supply.
      if (building.type === 'tavern' && building.inventory.food > 0 && building.inventory.ale === 0) {
        building.inventory.ale = Math.min(BUILDINGS.tavern.service!.supplyCapacity, building.inventory.food)
        building.inventory.food -= building.inventory.ale
      }
    }
  }

  if (candidate.raid === undefined) candidate.raid = { ...DEFAULT_RAID }
  if (candidate.immigration === undefined) candidate.immigration = { ...DEFAULT_IMMIGRATION }
  if (candidate.raid) {
    if (candidate.raid.totalDefeated === undefined) candidate.raid.totalDefeated = 0
    if (candidate.raid.lastClearedWave === undefined) candidate.raid.lastClearedWave = 0
  }

  if (candidate.totals) {
    migrateInventory(candidate.totals.gathered)
    migrateInventory(candidate.totals.deposited)
    migrateInventory(candidate.totals.delivered)
    if (candidate.totals.repairedHealth === undefined) candidate.totals.repairedHealth = 0
    if (candidate.totals.repairWoodUsed === undefined) candidate.totals.repairWoodUsed = 0
    if (candidate.totals.structureDamage === undefined) candidate.totals.structureDamage = 0
    if (candidate.totals.foodConsumed === undefined) candidate.totals.foodConsumed = 0
    if (candidate.totals.serviceConsumed === undefined) {
      candidate.totals.serviceConsumed = { wood: 0, food: candidate.totals.serviceFoodConsumed ?? 0, ale: 0 }
    }
    if (candidate.totals.productionConsumed === undefined) candidate.totals.productionConsumed = { wood: 0, food: 0, ale: 0 }
    if (candidate.totals.produced === undefined) candidate.totals.produced = { wood: 0, food: 0, ale: 0 }
    migrateInventory(candidate.totals.serviceConsumed)
    migrateInventory(candidate.totals.productionConsumed)
    migrateInventory(candidate.totals.produced)
  }

  // Convert in-flight legacy Tavern Food deliveries into Ale, or cancel them
  // before validation if they can no longer be represented safely.
  if (Array.isArray(candidate.jobs) && Array.isArray(candidate.settlers)) {
    const removeJobs = new Set<number>()
    for (const job of candidate.jobs) {
      const target = candidate.buildings?.find((building: any) => building.id === job.targetId)
      if (job.kind !== 'supply' || job.resource !== 'food' || target?.type !== 'tavern') continue
      const settler = candidate.settlers.find((agent: any) => agent.id === job.settlerId)
      if (job.stage === 'target' && settler?.cargo?.food > 0) {
        const amount = settler.cargo.food
        settler.cargo.food = 0
        settler.cargo.ale = amount
        job.resource = 'ale'
      } else {
        removeJobs.add(job.id)
        if (settler) {
          settler.jobId = null
          settler.path = []
          settler.pathRevision = -1
          settler.status = 'Needs work'
        }
      }
    }
    candidate.jobs = candidate.jobs.filter((job: any) => !removeJobs.has(job.id))
  }

  // Very old saves marked settlers as fed before food-consumption totals existed.
  if (
    Number.isInteger(candidate.day) && candidate.day >= 1
    && candidate.totals?.foodConsumed === 0
    && Array.isArray(candidate.settlers)
  ) {
    for (const settler of candidate.settlers) {
      if (settler.lastMealDay === candidate.day) settler.lastMealDay = Math.max(0, candidate.day - 1)
    }
  }
}
