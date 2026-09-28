import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { createGeneratedWorld, forestDensity, horizonHeight, MAX_MAP_NODES } = require('../.test-build/game/simulation/MapGenerator.js')
const { RegionalRouter, regionalReachability } = require('../.test-build/game/simulation/RegionalNavigation.js')
const { cellKey, flood, Navigation, blockedCells } = require('../.test-build/game/simulation/Navigation.js')
const { serializeWorld, deserializeWorld, validateWorld } = require('../.test-build/game/simulation/SaveLoad.js')
const { placeBuilding, placementError } = require('../.test-build/game/simulation/Buildings.js')
const { roadPlacementError, residentialPlotError } = require('../.test-build/game/simulation/TownPlanning.js')
const { fieldPlacementError } = require('../.test-build/game/simulation/FieldPlanning.js')
const { createBuilding } = require('../.test-build/game/simulation/WorldState.js')
const { Simulation } = require('../.test-build/game/simulation/Simulation.js')
const { spawnNightRaid } = require('../.test-build/game/simulation/Raid.js')
const { createMeadowField, createRoadSurface } = require('../.test-build/game/render/RoadSurface.js')
const { RoadTerrain } = require('../.test-build/game/render/RoadTerrain.js')

test('regional seeds reproduce identical worlds and differ across seeds/presets', () => {
  assert.deepEqual(createGeneratedWorld(42), createGeneratedWorld(42))
  assert.notDeepEqual(createGeneratedWorld(42).nodes, createGeneratedWorld(43).nodes)
  assert.notDeepEqual(createGeneratedWorld(42).nodes, createGeneratedWorld(42, 257, 'woodland').nodes)
  assert.throws(() => createGeneratedWorld(-1)); assert.throws(() => createGeneratedWorld(1, 9999))
})

test('all map sizes keep an open camp, nearby supplies, unique bounded resources and saved metadata', () => {
  for (const size of [129, 257, 513]) for (const seed of [0, 1, 137, 0xffffffff]) for (const preset of ['meadows', 'woodland']) {
    const world = createGeneratedWorld(seed, size, preset), half = (size - 1) / 2
    assert.ok(world.nodes.length <= MAX_MAP_NODES)
    assert.equal(new Set(world.nodes.map(cellKey)).size, world.nodes.length)
    assert.ok(world.nodes.every(n => Math.abs(n.x) < half && Math.abs(n.z) < half && Math.hypot(n.x, n.z) >= 9))
    for (const [resource, count] of [['wood', 40], ['food', 20], ['ore', 12]]) {
      assert.ok(world.nodes.filter(n => n.resource === resource && Math.hypot(n.x, n.z) < 33).length >= count, `${seed}/${size}/${resource}`)
    }
    assert.equal(forestDensity(0, 0, world.map), 0)
    assert.equal(horizonHeight(half, 0, world.map), 0)
    assert.deepEqual(deserializeWorld(serializeWorld(world)), world)
  }
})

test('large maps allow roads, plots, fields and buildings outside the old camp and reject their actual edge', () => {
  const world = createGeneratedWorld(137, 513); world.nodes = []
  assert.equal(placeBuilding(world, 'stockpile', { x: 180, z: 0 }), null)
  assert.ok(placementError(world, 'stockpile', { x: 256, z: 0 }))
  assert.equal(roadPlacementError([{ x: 100, z: 0 }, { x: 130, z: 0 }], [], 256), null)
  assert.ok(roadPlacementError([{ x: 255, z: 0 }, { x: 260, z: 0 }], [], 256))
  const farmhouse = createBuilding(world.nextId++, 'farmhouse', 100, 100, true)
  const points = [{ x: 105, z: 105 }, { x: 111, z: 105 }, { x: 111, z: 111 }, { x: 105, z: 111 }]
  assert.equal(fieldPlacementError(points, [], [farmhouse], [], [], [], 256), null)
  const plot = { frontageA: { x: 100, z: 0 }, frontageB: { x: 106, z: 0 }, width: 6, depth: 8, side: 1, angle: 0 }
  assert.equal(residentialPlotError(plot, [], 256), null)
  assert.ok(residentialPlotError(plot, []))
  world.map.size = 129
  assert.throws(() => validateWorld(world), /building/)
})

test('regional A* matches shortest BFS routes, including detours, blocked goals and disconnections', () => {
  const router = new RegionalRouter(23)
  for (let trial = 0; trial < 30; trial++) {
    const blocked = new Set()
    for (let z = -23; z <= 23; z++) for (let x = -23; x <= 23; x++) {
      if ((x * 31 + z * 13 + trial * 17) % 11 === 0) blocked.add(cellKey({ x, z }))
    }
    const from = { x: -20, z: -17 }, target = { x: 20, z: 18 }
    blocked.delete(cellKey(from)); blocked.delete(cellKey(target))
    const parents = flood(target, blocked), path = router.route(from, target, blocked)
    if (!parents.has(cellKey(from))) { assert.equal(path, null); continue }
    let length = 1, cursor = from
    while (parents.get(cellKey(cursor))) { cursor = parents.get(cellKey(cursor)); length++ }
    assert.equal(path.length, length)
    assert.deepEqual(path[0], from); assert.deepEqual(path.at(-1), target)
    assert.ok(path.every(p => !blocked.has(cellKey(p))))
  }
  assert.equal(router.route({ x: 0, z: 0 }, { x: 1, z: 0 }, new Set([cellKey({ x: 1, z: 0 })])), null)
  const wall = new Set(Array.from({ length: 47 }, (_, i) => cellKey({ x: 1, z: i - 23 })))
  assert.equal(router.route({ x: 0, z: 0 }, { x: 2, z: 0 }, wall), null)
})

test('513m local and region-spanning routes stay targeted, and global solve budget is unchanged', () => {
  const router = new RegionalRouter(256)
  assert.equal(router.route({ x: 0, z: 0 }, { x: 10, z: 5 }, new Set()).length, 16)
  assert.equal(router.visited, 16)
  assert.equal(router.route({ x: -255, z: -255 }, { x: 255, z: 255 }, new Set()).length, 1021)
  assert.equal(router.visited, 1021)
  const world = createGeneratedWorld(2, 513), nav = new Navigation()
  nav.sync(world)
  for (const settler of world.settlers) nav.request(settler.id, { x: 100, z: 0 }, 0)
  nav.process(world)
  assert.equal(nav.solved, 2); assert.equal(nav.depth, 4)
  assert.equal(nav.walkable({ x: 257, z: 0 }), false)
  assert.equal(nav.walkable({ x: 250, z: 0 }), true)
})

test('packed regional connectivity matches legacy flood around blocked compounds', () => {
  const world = createGeneratedWorld(); world.map = undefined
  for (let z = -4; z <= 4; z++) world.buildings.push(createBuilding(world.nextId++, 'wood-wall', 4, z, true))
  const blocked = blockedCells(world), old = flood({ x: 0, z: 2 }, blocked), region = regionalReachability({ x: 0, z: 2 }, blocked, 23)
  for (let z = -23; z <= 23; z++) for (let x = -23; x <= 23; x++) assert.equal(region.has(cellKey({ x, z })), old.has(cellKey({ x, z })))
})

test('generated settlement gathers, delivers, constructs and reloads a remote building', () => {
  const state = createGeneratedWorld(137, 257), simulation = new Simulation(state)
  const step = ticks => { for (let i = 0; i < ticks; i++) { state.timeOfDay = 0.4; simulation.step(0.05) } }
  step(3000)
  assert.ok(state.totals.deposited.wood > 0); assert.ok(state.totals.deposited.food > 0)
  state.nodes = state.nodes.filter(n => Math.abs(n.x - 60) > 3 || Math.abs(n.z) > 3)
  assert.equal(placeBuilding(state, 'stockpile', { x: 60, z: 0 }), null)
  step(5000)
  assert.equal(state.buildings.find(b => b.x === 60).complete, true)
  assert.ok(state.totals.delivered.wood >= 10)
  const loaded = deserializeWorld(serializeWorld(state))
  assert.equal(loaded.map.size, 257); assert.equal(loaded.buildings.find(b => b.x === 60).complete, true)
})

test('regional raids retain a short approach outside the occupied settlement edge', () => {
  const world = createGeneratedWorld(1, 513)
  spawnNightRaid(world)
  assert.equal(world.enemies.length, 20)
  assert.ok(world.enemies.every(e => e.z >= -26 && e.z <= -22))
  world.enemies = []; world.day++
  world.nodes = world.nodes.filter(n => Math.abs(n.x - 90) > 3 || Math.abs(n.z) > 3)
  world.buildings.push(createBuilding(world.nextId++, 'stockpile', 90, 0, true))
  spawnNightRaid(world)
  assert.ok(world.enemies.every(e => e.x >= 112))
  validateWorld(world)
})

test('regional meadow is seed-dependent and road texture resets on map changes', () => {
  const a = createGeneratedWorld(1).map, b = createGeneratedWorld(2).map
  assert.deepEqual(createMeadowField(277, 32, a), createMeadowField(277, 32, a))
  assert.notDeepEqual(createMeadowField(277, 32, a).pixels, createMeadowField(277, 32, b).pixels)
  const road = [{ id: 1, width: 2.4, points: [{ x: 60, z: 0 }, { x: 90, z: 0 }] }]
  const surface = createRoadSurface(road, 277, 128, createMeadowField(277, 128, a))
  assert.ok(surface.coverage.some(v => v > 0.5))
  const terrain = new RoadTerrain(67)
  terrain.update([], a); const first = terrain.surface
  terrain.update([], a); assert.equal(terrain.surface, first)
  terrain.update([], b); assert.notEqual(terrain.surface, first)
  terrain.update([]); assert.equal(terrain.surface.extent, 67)
  terrain.dispose()
})
