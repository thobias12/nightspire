import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { createBenchmarkWorld, stateDigest, POPULATIONS, TOTAL_TICKS } = require('../.test-build/game/benchmark/Scenarios.js')
const { summarize } = require('../.test-build/game/benchmark/Measurement.js')
const { Simulation } = require('../.test-build/game/simulation/Simulation.js')
const { JobReservations } = require('../.test-build/game/simulation/JobReservations.js')
const { available, freeStorage, supplyFree } = require('../.test-build/game/simulation/Buildings.js')
const { blockedCells, cellKey, entrance } = require('../.test-build/game/simulation/Navigation.js')
const { createInitialWorldState, createBuilding, spawnSettler, MAX_SETTLERS } = require('../.test-build/game/simulation/WorldState.js')
const { validateWorld } = require('../.test-build/game/simulation/SaveLoad.js')
const { serviceAssignment } = require('../.test-build/game/simulation/Services.js')
const { PATH_BUDGET } = require('../.test-build/game/data/jobs.js')
const { assignJobs } = require('../.test-build/game/simulation/Jobs.js')
test('QA presets are repeatable, use unique IDs and start on walkable cells', () => {
  for (const population of POPULATIONS) for (const workload of ['logistics', 'services', 'idle']) {
    const s = createBenchmarkWorld(population, workload)
    assert.equal(stateDigest(s), stateDigest(createBenchmarkWorld(population, workload)))
    assert.equal(s.settlers.length, population)
    const entities = [...s.settlers, ...s.buildings, ...s.nodes]
    assert.equal(new Set(entities.map(e => e.id)).size, entities.length)
    const blocked = blockedCells(s)
    assert.ok(s.settlers.every(a => !blocked.has(cellKey(a))))
    assert.equal(new Set(s.nodes.map(cellKey)).size, s.nodes.length)
  }
  assert.throws(() => createBenchmarkWorld(501, 'logistics'))
  assert.throws(() => createBenchmarkWorld(10, 'unknown'))
})

for (const population of [10, 100, 250, 500]) {
  for (const workload of ['logistics', 'services']) {
    test('current scale trajectory stays bounded: ' + population + ' ' + workload, () => {
      const s = createBenchmarkWorld(population, workload)
      const sim = new Simulation(s)
      for (let i = 0; i < TOTAL_TICKS; i++) {
        sim.step()
        assert.ok(sim.navigation.solved <= PATH_BUDGET)
      }
      assert.equal(sim.navigation.failures, 0)
    })
  }
}

test('current staffed scale trajectory remains deterministic', () => {
  const run = () => {
    const s = createBenchmarkWorld(100, 'logistics')
    const sim = new Simulation(s)
    for (let i = 0; i < TOTAL_TICKS; i++) sim.step()
    return {
      digest: stateDigest(s),
      requests: sim.navigation.requests,
      queue: sim.navigation.depth,
      failures: sim.navigation.failures,
    }
  }
  assert.deepEqual(run(), run())
})

test('pass-local reservation index matches job scans for every kind, stage and resource', () => {
  const s = createBenchmarkWorld(100, 'logistics')
  const index = new JobReservations([])
  for (const kind of ['gather', 'deliver', 'supply', 'repair', 'construct']) {
    for (const stage of ['source', 'target', 'work']) for (const resource of ['wood', 'food', 'ale', 'ore', 'tools']) {
      const job = { id: s.nextId++, settlerId: s.settlers[0].id, kind, stage, resource,
        sourceId: s.buildings[0].id, targetId: s.buildings[1].id, amount: 3, progress: 0 }
      s.jobs.push(job); index.add(job)
      for (const b of s.buildings) {
        assert.equal(freeStorage(s, b, index), freeStorage(s, b))
        for (const r of ['wood', 'food', 'ale', 'ore', 'tools']) {
          assert.equal(available(s, b, r, index), available(s, b, r))
          assert.equal(supplyFree(s, b, r, index), supplyFree(s, b, r))
          assert.equal(index.delivered(b.id, r), s.jobs.filter(j => j.kind === 'deliver' && j.targetId === b.id && j.resource === r).reduce((n,j) => n+j.amount,0))
        }
      }
    }
  }
  assert.deepEqual(new JobReservations(s.jobs), index)
  s.jobs = []
  const fresh = new JobReservations(s.jobs)
  assert.equal(fresh.pickup(s.buildings[0].id, 'wood'), 0)
  assert.equal(fresh.gatherSources.size, 0)
})

test('shared dusk service plan refreshes after a carried delivery in the same tick', () => {
  const s = createInitialWorldState()
  s.timeOfDay = 18 / 24
  const camp = createBuilding(s.nextId++, 'campfire', 7, 0, true)
  const tavern = createBuilding(s.nextId++, 'tavern', -7, 0, true)
  s.buildings.push(camp, tavern); s.topology++
  const [first, carrier, third] = s.settlers
  Object.assign(first, serviceAssignment(s, first, 'dusk').target)
  tavern.inventory.ale = 1
  Object.assign(third, serviceAssignment(s, third, 'dusk').target)
  tavern.inventory.ale = 0
  Object.assign(carrier, entrance(tavern))
  carrier.cargo.ale = 1
  const job = { id: s.nextId++, settlerId: carrier.id, kind: 'supply', sourceId: s.buildings[0].id,
    targetId: tavern.id, resource: 'ale', amount: 1, stage: 'target', progress: 0 }
  s.jobs.push(job); carrier.jobId = job.id
  const sim = new Simulation(s)
  sim.step()
  assert.equal(first.status, 'Visiting Campfire')
  assert.equal(third.status, 'Visiting Tavern')
  assert.equal(tavern.inventory.ale, 1)
  assert.equal(carrier.cargo.ale, 0)
  tavern.inventory.ale = 0
  sim.step()
  assert.notEqual(third.status, 'Visiting Tavern')
})

test('normal spawn and save caps stay at ten regardless of benchmark use', () => {
  createBenchmarkWorld(1000, 'services')
  const s = createInitialWorldState()
  while (spawnSettler(s)) {}
  assert.equal(s.settlers.length, 10)
  assert.equal(MAX_SETTLERS, 10)
  assert.equal(spawnSettler(s), false)
  validateWorld(s)
  assert.throws(() => validateWorld(createBenchmarkWorld(100, 'logistics')))
})

test('benchmark percentiles use nearest rank and include empty samples safely', () => {
  assert.deepEqual(summarize([]), { samples: 0, mean: 0, p50: 0, p95: 0, p99: 0, max: 0 })
  const result = summarize([4, 1, 3, 2])
  assert.equal(result.mean, 2.5)
  assert.equal(result.p50, 2)
  assert.equal(result.p95, 4)
})

test('nearest gathering preserves stable ties and skips nonessential nodes for hungry workers', () => {
  const s = createInitialWorldState()
  s.settlers = [s.settlers[0]]
  const worker = s.settlers[0]
  worker.x = 0; worker.z = 2; worker.needs.food = 0
  s.targets.wood = 1000; s.targets.food = 20
  s.nodes = [
    { id: s.nextId++, resource: 'wood', remaining: 100, x: 0, z: 3 },
    { id: s.nextId++, resource: 'food', remaining: 100, x: 4, z: 2 },
    { id: s.nextId++, resource: 'food', remaining: 100, x: -4, z: 2 },
  ]
  assignJobs(s)
  assert.equal(s.jobs.length, 1)
  assert.equal(s.jobs[0].sourceId, s.nodes[1].id)
  assert.equal(s.jobs[0].resource, 'food')
})
