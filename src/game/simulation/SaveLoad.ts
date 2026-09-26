import { BUILDINGS } from '../data/buildings'
import { CARRY_CAPACITY } from '../data/jobs'
import { RESOURCE_IDS } from '../data/resources'
import { available, freeStorage, readyToBuild, stockpiles } from './Buildings'
import { blockedCells, cellKey, entrance, flood, footprint, inBounds } from './Navigation'
import { DEFAULT_NEEDS, DEFAULT_RAID, DEFAULT_TARGETS, MAX_ENEMIES, MAX_SETTLERS, NEED_IDS, type WorldState } from './WorldState'

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

  const entities = [...s.settlers, ...s.enemies, ...s.buildings, ...s.nodes, ...s.jobs]
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
      && number(b.serviceProgress) && b.serviceProgress <= 300,
      'building state',
    )
    check(RESOURCE_IDS.every(r => b.delivered[r] <= def.buildCost[r]), 'excess delivery')
    check(!b.complete || (readyToBuild(b) && b.work === def.constructionWork), 'incomplete completed building')
    check(b.complete || (b.inventory.wood + b.inventory.food === 0 && b.health === 0 && !b.destroyed), 'unfinished structure state')
    check(!b.destroyed || (b.complete && b.health === 0), 'ruin state')
    if (def.storage > 0) {
      check(b.inventory.wood + b.inventory.food <= def.storage, 'storage capacity')
    } else {
      check(
        RESOURCE_IDS.every(resource => {
          const capacity = def.service?.supplyResource === resource ? def.service.supplyCapacity : 0
          return b.inventory[resource] <= capacity
        }),
        'service supply capacity',
      )
    }
    check(b.work === 0 || readyToBuild(b), 'work before materials')

    for (const p of footprint(b)) {
      check(inBounds(p) && !occupied.has(cellKey(p)), 'overlapping footprint')
      occupied.add(cellKey(p))
    }
  }

  check(s.buildings.some(b => b.type === 'stockpile' && b.complete && b.x === 0 && b.z === 0), 'missing starter camp')
  for (const n of s.nodes) check(gridPoint(n) && RESOURCE_IDS.includes(n.resource) && integer(n.remaining), 'resource node')

  for (const a of s.settlers) {
    check(point(a) && combatant(a, s.tick) && inventory(a.cargo) && a.cargo.wood + a.cargo.food <= CARRY_CAPACITY, 'settler/cargo')
    check(a.role === 'worker' || a.role === 'guard', 'settler role')
    check(needs(a.needs) && integer(a.lastMealDay) && a.lastMealDay <= s.day, 'settler needs')
    check(Array.isArray(a.path) && a.path.length <= 3000 && a.path.every(gridPoint) && Number.isInteger(a.pathRevision), 'route')
    check(typeof a.status === 'string' && a.status.length <= 120, 'status')
    check(
      a.homeId === null
      || s.buildings.some(b => b.id === a.homeId && b.complete && !b.destroyed && BUILDINGS[b.type].housing > 0),
      'home',
    )
    check(a.jobId === null || s.jobs.some(j => j.id === a.jobId && j.settlerId === a.id), 'job owner')
    check(a.jobId !== null || a.cargo.wood + a.cargo.food === 0, 'unowned cargo')
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
      const service = BUILDINGS[target.type].service
      check(
        source && source.complete && !source.destroyed && BUILDINGS[source.type].storage > 0
        && target.complete && !target.destroyed
        && service?.supplyResource === j.resource
        && j.stage !== 'work' && j.amount > 0,
        'service supply references',
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

  for (const b of stockpiles(s)) {
    check(RESOURCE_IDS.every(r => available(s, b, r) >= 0) && freeStorage(s, b) >= 0, 'over-reserved storage')
  }
  for (const b of s.buildings.filter(b => b.complete && BUILDINGS[b.type].storage > 0)) {
    check(RESOURCE_IDS.every(r => available(s, b, r) >= 0), 'over-reserved repair source')
  }

  for (const b of s.buildings) {
    const def = BUILDINGS[b.type]
    check(s.settlers.filter(a => a.homeId === b.id).length <= (b.destroyed ? 0 : def.housing), 'housing capacity')
    if (b.complete && def.service?.supplyResource) {
      const resource = def.service.supplyResource
      const incoming = s.jobs
        .filter(j => j.kind === 'supply' && j.targetId === b.id && j.resource === resource)
        .reduce((sum, job) => sum + job.amount, 0)
      check(b.inventory[resource] + incoming <= def.service.supplyCapacity, 'over-supplied service')
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
    && integer(s.totals.serviceFoodConsumed),
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

  if (candidate && candidate.version === 1 && candidate.targets === undefined) candidate.targets = { ...DEFAULT_TARGETS }

  if (candidate && candidate.version === 1 && Array.isArray(candidate.settlers)) {
    for (const settler of candidate.settlers) {
      if (settler.role === undefined) settler.role = 'worker'
      if (settler.health === undefined) Object.assign(settler, { health: 100, maxHealth: 100, attackCooldown: 0 })
      if (settler.lastHitTick === undefined) settler.lastHitTick = 0
      if (settler.needs === undefined) settler.needs = { ...DEFAULT_NEEDS }
      if (settler.lastMealDay === undefined) settler.lastMealDay = Math.max(0, candidate.day - 1)
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
    }
  }

  if (candidate && candidate.version === 1 && candidate.raid === undefined) candidate.raid = { ...DEFAULT_RAID }
  if (candidate && candidate.version === 1 && candidate.raid) {
    if (candidate.raid.totalDefeated === undefined) candidate.raid.totalDefeated = 0
    if (candidate.raid.lastClearedWave === undefined) candidate.raid.lastClearedWave = 0
  }

  if (candidate && candidate.version === 1 && candidate.totals) {
    if (candidate.totals.repairedHealth === undefined) candidate.totals.repairedHealth = 0
    if (candidate.totals.repairWoodUsed === undefined) candidate.totals.repairWoodUsed = 0
    if (candidate.totals.structureDamage === undefined) candidate.totals.structureDamage = 0
    if (candidate.totals.foodConsumed === undefined) candidate.totals.foodConsumed = 0
    if (candidate.totals.serviceFoodConsumed === undefined) candidate.totals.serviceFoodConsumed = 0
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
