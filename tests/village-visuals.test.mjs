import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { createInitialWorldState, createBuilding } = require('../.test-build/game/model/WorldState.js')
const { VillageRenderIndex, visibleStockUnits, workerActivity } = require('../.test-build/game/render/VillagePresentation.js')
const { WorkerActivityRenderer } = require('../.test-build/game/render/WorkerActivityRenderer.js')
const { TownBuildingRenderer } = require('../.test-build/game/render/TownBuildingRenderer.js')
const { createBenchmarkWorld } = require('../.test-build/game/benchmark/Scenarios.js')
const { createWeatheredGableRoofGeometry } = require('../.test-build/game/render/RenderPrimitives.js')
const rotate = (x, z, angle) => ({ x: x * Math.cos(angle) + z * Math.sin(angle), z: -x * Math.sin(angle) + z * Math.cos(angle) })
const fixture = () => {
  const calls = []
  return { calls, town: new TownBuildingRenderer((...args) => calls.push(args), rotate, {}), worker: new WorkerActivityRenderer((...args) => calls.push(args)) }
}

test('weathered roofs remain deterministic, finite, low-poly and within the original footprint', () => {
  const a = createWeatheredGableRoofGeometry(), b = createWeatheredGableRoofGeometry()
  const p = a.getAttribute('position')
  assert.deepEqual(p.array, b.getAttribute('position').array)
  assert.equal(p.count / 3, 26)
  for (let i = 0; i < p.count; i++) {
    assert.ok(Math.abs(p.getX(i)) <= 0.5 && Math.abs(p.getZ(i)) <= 0.5)
    assert.ok(p.getY(i) >= -0.01 && p.getY(i) <= 0.5)
  }
  assert.ok(a.getAttribute('normal').array.every(Number.isFinite))
  a.dispose(); b.dispose()
})

test('presentation index matches authoritative references at 500 and clears removed/save-loaded entities', () => {
  const state = createBenchmarkWorld(500, 'logistics'), saved = JSON.stringify(state), index = new VillageRenderIndex()
  index.refresh(state)
  assert.equal(index.buildings.size, state.buildings.length)
  assert.equal(index.nodes.size, state.nodes.length)
  for (const entity of state.nodes) assert.equal(index.nodes.get(entity.id), entity)
  for (const entity of state.residentialPlots) assert.equal(index.plots.get(entity.buildingId), entity)
  for (const id of index.staff.keys()) assert.equal(index.staff.get(id), state.settlers.filter(a => a.role === 'worker' && a.health > 0 && a.workplaceId === id).length)
  assert.equal(JSON.stringify(state), saved)
  const restored = JSON.parse(saved)
  index.refresh(restored)
  assert.equal(index.buildings.get(restored.buildings[0].id), restored.buildings[0])
  restored.jobs = []; restored.nodes = []; restored.buildings = []; restored.residentialPlots = []; restored.settlers = []
  index.refresh(restored)
  for (const collection of Object.values(index)) assert.equal(collection.size, 0)
})

test('job lookup and wood-node lookup rebuild after completion without retaining stale work', () => {
  const state = createInitialWorldState(), index = new VillageRenderIndex()
  const job = { id: 999, kind: 'gather', resource: 'wood', sourceId: state.nodes[0].id, targetId: state.buildings[0].id, stage: 'work', settlerId: state.settlers[0].id, amount: 5, progress: 2 }
  state.jobs.push(job); index.refresh(state)
  assert.equal(index.jobs.get(job.id), job)
  assert.equal(index.woodJobs.get(job.sourceId), job)
  state.jobs = []; index.refresh(state)
  assert.equal(index.jobs.size, 0); assert.equal(index.woodJobs.size, 0)
})

test('worker poses follow work stage, cargo and travel; dead agents do not work', () => {
  const a = createInitialWorldState().settlers[0]
  const job = { kind: 'construct', stage: 'source' }
  assert.equal(workerActivity(a, job), 'idle')
  job.stage = 'work'; assert.equal(workerActivity(a, job), 'build')
  job.kind = 'repair'; assert.equal(workerActivity(a, job), 'build')
  a.cargo.wood = 5; assert.equal(workerActivity(a, job), 'build')
  a.cargo.wood = 0
  a.path = [{ x: 1, z: 2 }]; assert.equal(workerActivity(a, job), 'walk')
  a.cargo.wood = 5; assert.equal(workerActivity(a, job), 'carry')
  a.health = 0; assert.equal(workerActivity(a, job), 'idle')
  a.health = 100; a.cargo.wood = 0; a.path = []; job.kind = 'gather'
  assert.equal(workerActivity(a, job), 'gather')
})

test('stock quantity bands are zero when empty, monotonic and capped', () => {
  for (const [unit, cap] of [[40,5],[30,4],[8,3],[5,6]]) {
    let previous = 0
    for (let amount = 0; amount <= 10000; amount++) {
      const count = visibleStockUnits(amount, unit, cap)
      assert.ok(count >= previous && count <= cap)
      previous = count
    }
    assert.equal(visibleStockUnits(0, unit, cap), 0)
    assert.equal(visibleStockUnits(1, unit, cap), 1)
  }
})

test('Forester output/tool props and House smoke reflect current state with bounded counts', () => {
  const { calls, town } = fixture(), lodge = createBuilding(101, 'foresters-lodge', 4, 7, true)
  town.renderForestersLodge(lodge, 0, 0x6f6547, 0, 0)
  assert.equal(calls.filter(c => c[0] === 'logs').length, 0)
  assert.equal(calls.filter(c => c[0] === 'metal').length, 0)
  lodge.inventory.wood = 10000; calls.length = 0
  town.renderForestersLodge(lodge, 0, 0x6f6547, 0, 500)
  assert.equal(calls.filter(c => c[0] === 'logs').length, 6)
  assert.equal(calls.filter(c => c[0] === 'metal').length, 3)
  const first = structuredClone(calls); calls.length = 0
  town.renderForestersLodge(lodge, 0, 0x6f6547, 0, 500)
  assert.deepEqual(calls, first)
  const house = createBuilding(103, 'house', 0, 0, true)
  calls.length = 0; town.renderHouse(house, 0, 0xb89973, 0, undefined, false, 5)
  assert.equal(calls.filter(c => c[0] === 'smoke').length, 0)
  calls.length = 0; town.renderHouse(house, 0, 0xb89973, 0, undefined, true, 5)
  assert.equal(calls.filter(c => c[0] === 'smoke').length, 2)
})

test('Stockpile shelter and goods rotate as a compound and large inventories stay bounded', () => {
  const { calls, town } = fixture(), store = createBuilding(107, 'stockpile', 4, 7, true)
  for (const r of Object.keys(store.inventory)) store.inventory[r] = 10000
  const saved = JSON.stringify(store)
  town.renderStockpile(store, 0, 0, 0)
  const first = structuredClone(calls)
  assert.ok(first.length < 65)
  calls.length = 0; town.renderStockpile(store, Math.PI / 2, 0, 0)
  assert.equal(calls.length, first.length)
  for (let i = 0; i < calls.length; i++) {
    const a = first[i], b = calls[i]
    const p = rotate(a[1] - store.x, a[3] - store.z, Math.PI / 2)
    assert.ok(Math.abs(b[1] - store.x - p.x) < 1e-8)
    assert.ok(Math.abs(b[3] - store.z - p.z) < 1e-8)
  }
  assert.equal(JSON.stringify(store), saved)
})

test('carrying preserves timber/ox presentation, all resources use bounded shared props, and site staging clears', () => {
  const { calls, worker } = fixture(), a = createInitialWorldState().settlers[0]
  for (const resource of Object.keys(a.cargo)) {
    for (const key of Object.keys(a.cargo)) a.cargo[key] = 0
    a.cargo[resource] = 10000; calls.length = 0
    const saved = JSON.stringify(a)
    worker.render(a, 'carry', 1.2, 3, false)
    assert.ok(calls.length > 0 && calls.length <= 3)
    assert.equal(calls.some(c => c[0] === 'cargo'), false)
    assert.equal(JSON.stringify(a), saved)
  }
  a.cargo.tools = 0; a.cargo.wood = 5; calls.length = 0
  worker.render(a, 'carry', 0, 3, true); assert.equal(calls.length, 0)
  const site = createBuilding(999, 'house', 0, 0, false)
  site.delivered.wood = 20
  worker.renderDeliveredTimber(site, 0); assert.equal(calls.length, 4)
  calls.length = 0; site.complete = true
  worker.renderDeliveredTimber(site, 0); assert.equal(calls.length, 0)
  site.complete = false; site.destroyed = true
  worker.renderDeliveredTimber(site, 0); assert.equal(calls.length, 0)
})
