import { LANDSCAPES, MAP_SIZES } from '../data/map'
import { terrainBlocked, terrainPolygonError, terrainRouteError } from '../world/MapTerrain'
import { MAX_MAP_NODES, worldHalf } from '../world/MapGenerator'
import { regionalReachability } from '../world/RegionalNavigation'
import { BUILDINGS } from '../data/buildings'
import { CARRY_CAPACITY } from '../data/jobs'
import { RESOURCE_IDS } from '../data/resources'
import { available, freeStorage, readyToBuild, resourceCapacity, stockpiles, supplyCapacity } from '../systems/construction/Buildings'
import { fieldArea, fieldCentroid, polygonsOverlap, simpleFieldPolygon } from '../world/FieldPlanning'
import { houseBedCapacity } from '../systems/population/HouseProgression'
import { blockedCells, cellKey, entrance, footprint, inBounds } from '../world/Navigation'
import { plotCorners, residentialPlotsOverlap } from '../world/TownPlanning'
import { MAX_ENEMIES, MAX_SETTLERS, NEED_IDS, type WorldState } from '../model/WorldState'
import { migrateWorldCandidate } from './SaveMigrations'

export const SAVE_KEY = 'nightspire.m1.save.v1'
export const BACKUP_KEY = 'nightspire.m1.backup.v1'

const check: (value: unknown, message: string) => asserts value = (value, message) => {
  if (!value) throw new Error('Invalid save: ' + message)
}
const number = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0
const integer = (v: unknown): v is number => number(v) && Number.isSafeInteger(v)
const inventory = (v: any): boolean => v && RESOURCE_IDS.every(r => integer(v[r]))
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
  check(s.map === undefined || s.map && [1,2].includes(s.map.version) && integer(s.map.seed) && s.map.seed <= 0xffffffff
    && MAP_SIZES.includes(s.map.size) && Object.hasOwn(LANDSCAPES,s.map.landscape)
    && (s.map.version === 2 || ['meadows','woodland'].includes(s.map.landscape)), 'map definition')
  const point = (v: any): boolean => v && Number.isFinite(v.x) && Number.isFinite(v.z) && inBounds(v, worldHalf(s))
  const gridPoint = (v: any): boolean => point(v) && Number.isInteger(v.x) && Number.isInteger(v.z)
  check(integer(s.nextId) && integer(s.tick) && integer(s.topology) && number(s.elapsedSeconds), 'clock/identity')
  check(integer(s.day) && s.day >= 1 && number(s.timeOfDay) && s.timeOfDay < 1 && point(s.player) && combatant(s.player, s.tick), 'time/player')
  check(inventory(s.targets) && RESOURCE_IDS.every(r => s.targets[r] <= 10_000), 'stock targets')
  check(Array.isArray(s.settlers) && s.settlers.length <= MAX_SETTLERS && s.settlers.length > 0, 'population')
  check(Array.isArray(s.buildings) && s.buildings.length > 0 && s.buildings.length <= 120, 'buildings')
  check(Array.isArray(s.nodes) && s.nodes.length <= (s.map ? MAX_MAP_NODES : 1000) && Array.isArray(s.jobs) && s.jobs.length <= MAX_SETTLERS, 'entities')
  for (const node of s.nodes) {
    check(gridPoint(node) && RESOURCE_IDS.includes(node.resource) && integer(node.remaining), 'resource node')
    check(node.planted === undefined || typeof node.planted === 'boolean', 'managed tree flag')
    check(node.growth === undefined || number(node.growth) && node.growth <= 1, 'managed tree growth')
    check(node.resource === 'wood' || (node.planted === undefined && node.growth === undefined), 'managed resource kind')
    check(!node.planted || node.growth !== undefined, 'managed tree growth state')
  }
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
    check(b.work === 0 || readyToBuild(b), 'work before materials')

    for (const p of footprint(b)) {
      check(inBounds(p, worldHalf(s)) && !occupied.has(cellKey(p)), 'overlapping footprint')
      occupied.add(cellKey(p))
    }
  }

  check(s.buildings.some(b => b.type === 'stockpile' && b.complete && b.x === 0 && b.z === 0), 'missing starter camp')

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
  const builders = new Set<number>()
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
      const targetDefinition = BUILDINGS[target.type]
      const resourceOperation = targetDefinition.resourceOperation
      const validGatherDestination = targetDefinition.storage > 0
        || resourceOperation?.resource === j.resource
      check(node && node.resource === j.resource && !gatherers.has(node.id) && j.amount > 0, 'gather claim')
      check(j.stage === 'target' || node.remaining >= j.amount, 'exhausted claim')
      check(target.complete && !target.destroyed && validGatherDestination, 'gather destination')
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
      check(
        j.sourceId === j.targetId && !target.complete && readyToBuild(target)
        && j.stage !== 'target' && j.amount === 0 && !builders.has(target.id),
        'construction claim',
      )
      builders.add(target.id)
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
    if (def.resourceOperation) {
      const resource = def.resourceOperation.resource
      const incoming = s.jobs
        .filter(job => job.kind === 'gather' && job.targetId === b.id && job.resource === resource)
        .reduce((sum, job) => sum + job.amount, 0)
      check(b.inventory[resource] + incoming <= def.resourceOperation.outputCapacity, 'resource workplace buffer')
    }
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

  const terrain = terrainBlocked(s.map)
  check(s.buildings.every(b => footprint(b).every(p => !terrain.has(cellKey(p)))), 'building on water')
  check(s.roads.every(r => !terrainRouteError(r.points,s.map,r.width)), 'road on water')
  check(s.fields.every(f => !terrainPolygonError(f.points,s.map)), 'field on water')
  check(s.residentialPlots.every(p => !terrainPolygonError(plotCorners(p),s.map)), 'residential plot on water')
  const reachable = regionalReachability({ x: 0, z: 2 }, blockedCells(s, false), worldHalf(s))
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
  migrateWorldCandidate(candidate)

  validateWorld(candidate)

  // Routes are transient; rebuild from saved task/cargo/schedule/raid ownership.
  for (const a of [...candidate.settlers, ...candidate.enemies]) {
    a.path = []
    a.pathRevision = -1
  }
  return candidate
}
