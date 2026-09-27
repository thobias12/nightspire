import { BUILDINGS } from '../data/buildings'
import { CARRY_CAPACITY } from '../data/jobs'
import { RESOURCE_IDS } from '../data/resources'
import { available, freeStorage, readyToBuild, resourceCapacity, stockpiles, supplyCapacity } from './Buildings'
import { canAdvanceConstruction, constructionCrewCapacity, constructionWorkLimit } from './Construction'
import { fieldArea, fieldCentroid, polygonsOverlap, simpleFieldPolygon } from './FieldPlanning'
import { houseBedCapacity } from './HouseProgression'
import { blockedCells, cellKey, entrance, flood, footprint, inBounds } from './Navigation'
import { residentialPlotsOverlap } from './TownPlanning'
import {
  DEFAULT_IMMIGRATION, DEFAULT_NEEDS, DEFAULT_RAID, DEFAULT_TARGETS, MAX_ENEMIES, MAX_SETTLERS, NEED_IDS,
  defaultTradeState, type WorldState,
} from './WorldState'

export const SAVE_KEY = 'nightspire.m1.save.v1'
export const BACKUP_KEY = 'nightspire.m1.backup.v1'

const check: (value: unknown, message: string) => asserts value = (value, message) => {
  if (!value) throw new Error('Invalid save: ' + message)
}
const number = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0
const integer = (v: unknown): v is number => number(v) && Number.isSafeInteger(v)
const inventory = (v: any): boolean => v && RESOURCE_IDS.every(r => integer(v[r]))
const point = (v: any): boolean => v && Number.isFinite(v.x) && Number.isFinite(v.z) && inBounds(v)
const gridPoint = (v: any): boolean => point(v) && Number.isInteger(v.x) && Number.isInteger(v.z)
const needs = (v: any): boolean => v && NEED_IDS.every(need => number(v[need]) && v[need] <= 100)
const combatant = (v: any, tick: number): boolean =>
  v && integer(v.maxHealth) && v.maxHealth > 0
  && integer(v.health) && v.health <= v.maxHealth
  && number(v.attackCooldown) && v.attackCooldown <= 60
  && integer(v.lastHitTick) && v.lastHitTick <= tick

// Validate the whole candidate before replacing a live world. No partial load or silent reset.
export function validateWorld(value: unknown): asserts value is WorldState {
  const s = value as WorldState
  check(s && s.version === 1, 'unsupported version')
  check(integer(s.nextId) && integer(s.tick) && integer(s.topology) && number(s.elapsedSeconds), 'clock/identity')
  check(integer(s.day) && s.day >= 1 && number(s.timeOfDay) && s.timeOfDay < 1 && point(s.player) && combatant(s.player, s.tick), 'time/player')
  check(inventory(s.targets) && RESOURCE_IDS.every(r => s.targets[r] <= 10_000), 'stock targets')
  check(Array.isArray(s.settlers) && s.settlers.length <= MAX_SETTLERS && s.settlers.length > 0, 'population')
  check(Array.isArray(s.buildings) && s.buildings.length > 0 && s.buildings.length <= 120, 'buildings')
  check(Array.isArray(s.nodes) && s.nodes.length <= 1000 && Array.isArray(s.jobs) && s.jobs.length <= MAX_SETTLERS, 'entities')
  check(Array.isArray(s.enemies) && s.enemies.length <= MAX_ENEMIES, 'enemies')
  check(Array.isArray(s.roads) && s.roads.length <= 200, 'roads')
  check(Array.isArray(s.residentialPlots) && s.residentialPlots.length <= 80, 'residential plots')
  check(Array.isArray(s.fields) && s.fields.length <= 40, 'farm fields')
  check(
    s.trade
    && integer(s.trade.gold)
    && s.trade.policies
    && RESOURCE_IDS.every(resource => {
      const policy = s.trade.policies[resource]
      return policy && ['keep', 'export', 'import'].includes(policy.mode) && integer(policy.reserve) && policy.reserve <= 500
    })
    && integer(s.trade.nextMerchantDay) && s.trade.nextMerchantDay >= 1
    && integer(s.trade.merchantDay) && s.trade.merchantDay <= s.day
    && integer(s.trade.lastTransactionDay) && s.trade.lastTransactionDay <= s.day
    && integer(s.trade.visits)
    && integer(s.trade.goldEarned)
    && integer(s.trade.goldSpent)
    && inventory(s.trade.imported)
    && inventory(s.trade.exported),
    'trade state',
  )
  check(
    s.raid
    && integer(s.raid.lastSpawnDay) && s.raid.lastSpawnDay <= s.day
    && integer(s.raid.wave)
    && integer(s.raid.totalSpawned)
    && integer(s.raid.totalDefeated)
    && integer(s.raid.lastClearedWave) && s.raid.lastClearedWave <= s.raid.wave
    && s.raid.totalSpawned >= s.enemies.length + s.raid.totalDefeated,
    'raid state',
  )

  const entities = [...s.settlers, ...s.enemies, ...s.buildings, ...s.nodes, ...s.jobs, ...s.roads, ...s.residentialPlots, ...s.fields]
  check(entities.every(e => e && integer(e.id) && e.id > 0 && e.id < s.nextId), 'entity IDs')
  check(new Set(entities.map(e => e.id)).size === entities.length, 'duplicate IDs')

  const occupied = new Set<number>()
  for (const b of s.buildings) {
    check(typeof b.type === 'string' && b.type in BUILDINGS && gridPoint(b) && typeof b.complete === 'boolean', 'building')
    const def = BUILDINGS[b.type]
    check(
      inventory(b.inventory) && inventory(b.delivered)
      && number(b.work) && b.work <= def.constructionWork
      && integer(b.maxHealth) && b.maxHealth === def.maxHealth
      && integer(b.health) && b.health <= b.maxHealth
      && typeof b.destroyed === 'boolean'
      && integer(b.lastHitTick) && b.lastHitTick <= s.tick
      && number(b.serviceProgress) && b.serviceProgress <= 300
      && number(b.productionProgress) && b.productionProgress <= 300
      && integer(b.distributionDay) && b.distributionDay <= s.day
      && integer(b.distributionServed) && b.distributionServed <= MAX_SETTLERS
      && integer(b.houseLevel) && (b.type === 'house' ? b.houseLevel >= 1 && b.houseLevel <= 3 : b.houseLevel === 0)
      && integer(b.houseQualifyingDays) && b.houseQualifyingDays <= 3
      && integer(b.houseLastEvaluationDay) && b.houseLastEvaluationDay <= s.day
      && integer(b.rotation) && b.rotation <= 3
      && ['low', 'normal', 'high'].includes(b.haulPriority)
      && ['low', 'normal', 'high'].includes(b.stockpilePriority)
      && b.stockpileFilters && RESOURCE_IDS.every(resource => typeof b.stockpileFilters[resource] === 'boolean')
      && (b.facingAngle === undefined || Number.isFinite(b.facingAngle)),
      'building state',
    )
    check(RESOURCE_IDS.every(r => b.delivered[r] <= def.buildCost[r]), 'excess delivery')
    check(!b.complete || (readyToBuild(b) && b.work === def.constructionWork), 'incomplete completed building')
    check(b.complete || (RESOURCE_IDS.reduce((sum, resource) => sum + b.inventory[resource], 0) === 0 && b.health === 0 && !b.destroyed), 'unfinished structure state')
    check(!b.destroyed || (b.complete && b.health === 0), 'ruin state')
    if (def.storage > 0) {
      check(RESOURCE_IDS.reduce((sum, resource) => sum + b.inventory[resource], 0) <= def.storage, 'storage capacity')
    } else {
      check(RESOURCE_IDS.every(resource => b.inventory[resource] <= resourceCapacity(b, resource)), 'building resource capacity')
      if ((def.tradeStorageCapacity ?? 0) > 0) {
        check(
          RESOURCE_IDS.reduce((sum, resource) => sum + b.inventory[resource], 0) <= def.tradeStorageCapacity!,
          'trade storage capacity',
        )
      }
    }
    check(b.work <= constructionWorkLimit(b) + 1e-6, 'construction exceeds delivered materials')

    for (const p of footprint(b)) {
      check(inBounds(p) && !occupied.has(cellKey(p)), 'overlapping footprint')
      occupied.add(cellKey(p))
    }
  }

  check(s.buildings.some(b => b.type === 'stockpile' && b.complete && b.x === 0 && b.z === 0), 'missing starter camp')
  for (const n of s.nodes) check(gridPoint(n) && RESOURCE_IDS.includes(n.resource) && integer(n.remaining), 'resource node')

  for (const road of s.roads) {
    check(number(road.width) && road.width >= 1 && road.width <= 4, 'road width')
    check(
      Array.isArray(road.points) && road.points.length >= 2 && road.points.length <= 120
      && road.points.every(point),
      'road path',
    )
  }

  for (let i = 0; i < s.fields.length; i++) {
    const field = s.fields[i]
    check(point(field), 'field center')
    check(Array.isArray(field.points) && field.points.length >= 3 && field.points.length <= 8 && field.points.every(point), 'field points')
    check(simpleFieldPolygon(field.points), 'field polygon')
    const area = fieldArea(field.points)
    const center = fieldCentroid(field.points)
    check(number(field.area) && Math.abs(field.area - area) < 0.01 && area >= 12 && area <= 180, 'field area')
    check(Math.abs(field.x - center.x) < 0.01 && Math.abs(field.z - center.z) < 0.01, 'field centroid')
    check(integer(field.yield) && field.yield >= 8 && field.yield <= 60, 'field yield')
    check(['fallow', 'sown', 'growing', 'ready', 'harvested'].includes(field.phase), 'field phase')
    check(number(field.work) && field.work <= 120, 'field work')
    check(integer(field.growthDays) && field.growthDays <= 4, 'field growth')
    check(integer(field.lastGrowthDay) && field.lastGrowthDay <= s.day, 'field growth day')
    check(
      field.farmhouseId === null
      || s.buildings.some(building => building.id === field.farmhouseId && building.type === 'farmhouse'),
      'field farmhouse',
    )
    for (let j = 0; j < i; j++) check(!polygonsOverlap(field.points, s.fields[j].points), 'overlapping fields')
  }

  const plottedBuildings = new Set<number>()
  for (let i = 0; i < s.residentialPlots.length; i++) {
    const plot = s.residentialPlots[i]
    const building = s.buildings.find(candidate => candidate.id === plot.buildingId)
    check(building?.type === 'house', 'residential plot house')
    check(s.roads.some(road => road.id === plot.roadId), 'residential plot road')
    check(point(plot.frontageA) && point(plot.frontageB), 'residential frontage')
    check(number(plot.depth) && plot.depth >= 5 && plot.depth <= 13, 'residential depth')
    check(plot.side === 1 || plot.side === -1, 'residential side')
    check(Number.isFinite(plot.angle), 'residential angle')
    check(['garden', 'chickens', 'workyard', 'firewood'].includes(plot.backyard), 'residential backyard')
    check(!plottedBuildings.has(plot.buildingId), 'duplicate residential house')
    plottedBuildings.add(plot.buildingId)
    for (let j = 0; j < i; j++) check(!residentialPlotsOverlap(plot, s.residentialPlots[j]), 'overlapping residential plots')
  }

  for (const a of s.settlers) {
    check(point(a) && combatant(a, s.tick) && inventory(a.cargo) && RESOURCE_IDS.reduce((sum, resource) => sum + a.cargo[resource], 0) <= CARRY_CAPACITY, 'settler/cargo')
    check(a.role === 'worker' || a.role === 'guard', 'settler role')
    check(
      a.workplaceId === null
      || (
        a.role === 'worker'
        && integer(a.workplaceId)
        && s.buildings.some(b => b.id === a.workplaceId && b.complete && (BUILDINGS[b.type].workerSlots ?? 0) > 0)
      ),
      'settler workplace',
    )
    check(needs(a.needs) && integer(a.lastMealDay) && a.lastMealDay <= s.day, 'settler needs')
    check(Array.isArray(a.path) && a.path.length <= 3000 && a.path.every(gridPoint) && Number.isInteger(a.pathRevision), 'route')
    check(typeof a.status === 'string' && a.status.length <= 120, 'status')
    check(
      a.homeId === null
      || s.buildings.some(b => b.id === a.homeId && b.complete && !b.destroyed && BUILDINGS[b.type].housing > 0),
      'home',
    )
    check(a.jobId === null || s.jobs.some(j => j.id === a.jobId && j.settlerId === a.id), 'job owner')
    check(a.jobId !== null || RESOURCE_IDS.every(resource => a.cargo[resource] === 0), 'unowned cargo')
  }

  for (const enemy of s.enemies) {
    check(point(enemy) && combatant(enemy, s.tick) && enemy.kind === 'raider' && integer(enemy.targetId), 'enemy')
    check(Array.isArray(enemy.path) && enemy.path.length <= 3000 && enemy.path.every(gridPoint) && Number.isInteger(enemy.pathRevision), 'enemy route')
    check(typeof enemy.status === 'string' && enemy.status.length <= 120, 'enemy status')
    check(s.buildings.some(b => b.id === enemy.targetId && b.complete), 'enemy target')
  }

  const workers = new Set<number>()
  const gatherers = new Set<number>()
  const builders = new Map<number, number>()
  const repairers = new Set<number>()

  for (const j of s.jobs) {
    const a = s.settlers.find(a => a.id === j.settlerId)
    const target = s.buildings.find(b => b.id === j.targetId)
    check(a && a.jobId === j.id && !workers.has(a.id) && target, 'job references')
    workers.add(a.id)

    check(['gather', 'deliver', 'supply', 'construct', 'repair'].includes(j.kind) && ['source', 'work', 'target'].includes(j.stage), 'job kind/stage')
    check(RESOURCE_IDS.includes(j.resource) && integer(j.amount) && j.amount <= CARRY_CAPACITY && number(j.progress), 'job amount/progress')

    if (j.kind === 'gather') {
      const node = s.nodes.find(n => n.id === j.sourceId)
      check(node && node.resource === j.resource && !gatherers.has(node.id) && j.amount > 0, 'gather claim')
      check(j.stage === 'target' || node.remaining >= j.amount, 'exhausted claim')
      check(target.complete && !target.destroyed && BUILDINGS[target.type].storage > 0, 'gather destination')
      gatherers.add(node.id)
    } else if (j.kind === 'deliver') {
      const source = s.buildings.find(b => b.id === j.sourceId)
      check(
        source && source.complete && !source.destroyed && BUILDINGS[source.type].storage > 0
        && !target.complete && j.stage !== 'work' && j.amount > 0,
        'delivery references',
      )
    } else if (j.kind === 'supply') {
      const source = s.buildings.find(b => b.id === j.sourceId)
      const productionSource = source ? BUILDINGS[source.type].production : null
      const sourceCanProvide = !!source && (
        BUILDINGS[source.type].storage > 0
        || productionSource?.outputResource === j.resource
        || (BUILDINGS[source.type].tradeStorageCapacity ?? 0) > 0
        || (j.resource === 'food' && (BUILDINGS[source.type].agricultureStorageCapacity ?? 0) > 0)
      )
      check(
        source && source.complete && !source.destroyed && sourceCanProvide
        && target.complete && !target.destroyed
        && (
          BUILDINGS[target.type].storage > 0
          || supplyCapacity(target, j.resource) > 0
          || (BUILDINGS[target.type].tradeStorageCapacity ?? 0) > 0
        )
        && j.stage !== 'work' && j.amount > 0,
        'supply references',
      )
    } else if (j.kind === 'construct') {
      const crew = builders.get(target.id) ?? 0
      check(
        j.sourceId === j.targetId && !target.complete
        && (canAdvanceConstruction(target) || j.stage === 'work')
        && j.stage !== 'target' && j.amount === 0 && crew < constructionCrewCapacity(target),
        'construction claim',
      )
      builders.set(target.id, crew + 1)
    } else {
      const source = s.buildings.find(b => b.id === j.sourceId)
      check(
        source && source.complete && BUILDINGS[source.type].storage > 0
        && target.complete && target.health < target.maxHealth
        && j.resource === 'wood' && j.amount > 0 && !repairers.has(target.id),
        'repair claim',
      )
      repairers.add(target.id)
    }

    const ownsCargo = j.stage === 'target' || (j.kind === 'repair' && j.stage === 'work')
    check(
      RESOURCE_IDS.every(r => a.cargo[r] === (ownsCargo && r === j.resource ? j.amount : 0)),
      'cargo/job mismatch',
    )
  }

  for (const b of s.buildings) {
    const slots = BUILDINGS[b.type].workerSlots ?? 0
    if (slots > 0) check(s.settlers.filter(a => a.workplaceId === b.id).length <= slots, 'workplace capacity')
  }

  for (const b of stockpiles(s)) {
    check(RESOURCE_IDS.every(r => available(s, b, r) >= 0) && freeStorage(s, b) >= 0, 'over-reserved storage')
  }
  for (const b of s.buildings.filter(b => b.complete && BUILDINGS[b.type].storage > 0)) {
    check(RESOURCE_IDS.every(r => available(s, b, r) >= 0), 'over-reserved repair source')
  }

  for (const b of s.buildings) {
    const def = BUILDINGS[b.type]
    check(s.settlers.filter(a => a.homeId === b.id).length <= (b.destroyed ? 0 : houseBedCapacity(b)), 'housing capacity')
    if (b.complete) {
      for (const resource of RESOURCE_IDS) {
        const capacity = supplyCapacity(b, resource)
        if (capacity <= 0) continue
        const incoming = s.jobs
          .filter(j => j.kind === 'supply' && j.targetId === b.id && j.resource === resource)
          .reduce((sum, job) => sum + job.amount, 0)
        check(b.inventory[resource] + incoming <= capacity, 'over-supplied building')
      }
    }
    if (!b.complete) {
      check(
        RESOURCE_IDS.every(r =>
          b.delivered[r]
          + s.jobs.filter(j => j.kind === 'deliver' && j.targetId === b.id && j.resource === r).reduce((n, j) => n + j.amount, 0)
          <= BUILDINGS[b.type].buildCost[r]
        ),
        'over-reserved site',
      )
    }
  }

  const reachable = flood({ x: 0, z: 2 }, blockedCells(s, false))
  check(
    [...s.settlers, s.player, ...s.buildings.map(entrance), ...s.nodes.filter(n => n.remaining > 0)]
      .every(p => reachable.has(cellKey(p))),
    'disconnected friendly world',
  )

  check(
    s.totals
    && inventory(s.totals.gathered)
    && inventory(s.totals.deposited)
    && inventory(s.totals.delivered)
    && integer(s.totals.constructed)
    && integer(s.totals.repairedHealth)
    && integer(s.totals.repairWoodUsed)
    && integer(s.totals.structureDamage)
    && integer(s.totals.foodConsumed)
    && inventory(s.totals.serviceConsumed)
    && inventory(s.totals.productionConsumed)
    && inventory(s.totals.produced),
    'counters',
  )
  check(Array.isArray(s.events) && s.events.length <= 6 && s.events.every(e => typeof e === 'string' && e.length < 200), 'events')
}

export function serializeWorld(state: WorldState): string {
  validateWorld(state)
  return JSON.stringify(state)
}

export function deserializeWorld(text: string): WorldState {
  check(text.length <= 2_000_000, 'file too large')
  const candidate: any = JSON.parse(text)
  const migrateInventory = (value: any): void => {
    if (!value) return
    for (const resource of RESOURCE_IDS) if (value[resource] === undefined) value[resource] = 0
  }

  if (candidate && candidate.version === 1 && candidate.targets === undefined) candidate.targets = { ...DEFAULT_TARGETS }
  migrateInventory(candidate?.targets)
  if (candidate && candidate.version === 1 && candidate.trade === undefined) candidate.trade = defaultTradeState()
  if (candidate && candidate.version === 1 && candidate.trade) {
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
  if (candidate && candidate.version === 1 && candidate.roads === undefined) candidate.roads = []
  if (candidate && candidate.version === 1 && candidate.residentialPlots === undefined) candidate.residentialPlots = []
  if (candidate && candidate.version === 1 && candidate.fields === undefined) candidate.fields = []

  if (candidate && candidate.version === 1 && Array.isArray(candidate.settlers)) {
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

  if (candidate && candidate.version === 1 && candidate.player?.health === undefined) {
    Object.assign(candidate.player, { health: 100, maxHealth: 100, attackCooldown: 0 })
  }
  if (candidate && candidate.version === 1 && candidate.player?.lastHitTick === undefined) candidate.player.lastHitTick = 0

  if (candidate && candidate.version === 1 && candidate.enemies === undefined) candidate.enemies = []
  if (candidate && candidate.version === 1 && Array.isArray(candidate.enemies)) {
    for (const enemy of candidate.enemies) {
      if (enemy.health === undefined) Object.assign(enemy, { health: 40, maxHealth: 40, attackCooldown: 0 })
      if (enemy.lastHitTick === undefined) enemy.lastHitTick = 0
    }
  }

  if (candidate && candidate.version === 1 && Array.isArray(candidate.buildings)) {
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
      if (building.type === 'tavern' && building.inventory.food > 0 && building.inventory.ale === 0) {
        building.inventory.ale = Math.min(BUILDINGS.tavern.service!.supplyCapacity, building.inventory.food)
        building.inventory.food -= building.inventory.ale
      }
    }
  }

  if (candidate && candidate.version === 1 && candidate.raid === undefined) candidate.raid = { ...DEFAULT_RAID }
  if (candidate && candidate.version === 1 && candidate.immigration === undefined) candidate.immigration = { ...DEFAULT_IMMIGRATION }
  if (candidate && candidate.version === 1 && candidate.raid) {
    if (candidate.raid.totalDefeated === undefined) candidate.raid.totalDefeated = 0
    if (candidate.raid.lastClearedWave === undefined) candidate.raid.lastClearedWave = 0
  }

  if (candidate && candidate.version === 1 && candidate.totals) {
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

  if (candidate && candidate.version === 1 && Array.isArray(candidate.jobs) && Array.isArray(candidate.settlers)) {
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

  if (
    candidate && candidate.version === 1
    && Number.isInteger(candidate.day) && candidate.day >= 1
    && candidate.totals?.foodConsumed === 0
    && Array.isArray(candidate.settlers)
  ) {
    for (const settler of candidate.settlers) {
      if (settler.lastMealDay === candidate.day) settler.lastMealDay = Math.max(0, candidate.day - 1)
    }
  }

  validateWorld(candidate)

  // Routes are transient; rebuild from saved task/cargo/schedule/raid ownership.
  for (const a of [...candidate.settlers, ...candidate.enemies]) {
    a.path = []
    a.pathRevision = -1
  }
  return candidate
}
