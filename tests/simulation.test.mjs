import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { createInitialWorldState, spawnSettler, DEFAULT_TARGETS } = require('../.test-build/game/simulation/WorldState.js')
const { Simulation } = require('../.test-build/game/simulation/Simulation.js')
const { cancelBuilding, placeBuilding, placementError, stockpiles, available, freeStorage } = require('../.test-build/game/simulation/Buildings.js')
const { serializeWorld, deserializeWorld, validateWorld } = require('../.test-build/game/simulation/SaveLoad.js')
const { blockedCells, cellKey } = require('../.test-build/game/simulation/Navigation.js')
const { PATH_BUDGET } = require('../.test-build/game/data/jobs.js')
const advance = (sim, seconds) => {
  for (let i = 0; i < seconds * 20; i++) {
    sim.step()
    assert.ok(sim.navigation.solved <= PATH_BUDGET)
    if (i % 100 === 0) validateWorld(sim.state)
  }
}
const total = (s, r) => s.nodes.filter(n => n.resource === r).reduce((v,n) => v+n.remaining,0) +
  s.buildings.reduce((v,b) => v+b.inventory[r]+b.delivered[r],0) + s.settlers.reduce((v,a) => v+a.cargo[r],0)
const pop10 = s => { while(spawnSettler(s)) {} }
test('ten settlers gather both resources, carry, deposit, supply three houses and a stockpile', () => {
  const s = createInitialWorldState(); pop10(s)
  const sim = new Simulation(s), initial = { wood: total(s, 'wood'), food: total(s, 'food') }
  for (const [type,x,z] of [['house',-7,0],['house',7,0],['house',7,6],['stockpile',-7,6]]) assert.equal(placeBuilding(s,type,{x,z}), null)
  const stages = new Set()
  for(let i=0;i<6000;i++) {
    sim.step()
    assert.ok(sim.navigation.solved <= PATH_BUDGET)
    for(const job of s.jobs) stages.add(job.kind+':'+job.stage)
    if (i%100===0) {
      validateWorld(s)
      const blocked = blockedCells(s)
      assert.ok(s.settlers.every(a => !blocked.has(cellKey(a))))
    }
  }
  assert.ok(s.buildings.every(b => b.complete))
  assert.equal(s.totals.constructed,4)
  assert.equal(s.totals.delivered.wood,70)
  assert.ok(s.totals.deposited.wood>70 && s.totals.deposited.food>0)
  assert.equal(s.settlers.filter(a=>a.homeId!==null).length,10)
  for (const stage of ['gather:source','gather:work','gather:target','deliver:source','deliver:target','construct:work']) assert.ok(stages.has(stage),stage)
  assert.equal(total(s,'wood'),initial.wood); assert.equal(total(s,'food'),initial.food)
  assert.equal(sim.navigation.failures,0)
})
test('save/load resumes gathering, loaded cargo, deliveries and construction without loss or duplication', () => {
  for(const stage of ['gather:work','gather:target','deliver:source','deliver:target','construct:work']) {
    const s = createInitialWorldState(); const sim = new Simulation(s)
    if (stage === 'deliver:source') { s.buildings[0].inventory.wood = 20; s.settlers.forEach(a => { a.x = 4; a.z = 5 }) }
    placeBuilding(s,'house',{x:7,z:0})
    let found=false
    for(let i=0;i<4000;i++) {
      sim.step()
      if(s.jobs.some(j=>j.kind+':'+j.stage===stage)) {found=true;break}
    }
    assert.ok(found,stage)
    const saved = serializeWorld(s), loaded = deserializeWorld(saved)
    assert.deepEqual(loaded.jobs,s.jobs); assert.deepEqual(loaded.settlers.map(a=>a.cargo),s.settlers.map(a=>a.cargo))
    const resumed=new Simulation(loaded); advance(resumed,130)
    assert.ok(loaded.buildings.every(b=>b.complete),stage)
    for(const r of ['wood','food']) assert.equal(total(loaded,r),total(s,r),stage+' '+r)
    assert.equal(resumed.navigation.failures,0)
  }
})
test('queued construction waits for materials and competing sites never double reserve', () => {
  const s=createInitialWorldState(); pop10(s)
  placeBuilding(s,'house',{x:7,z:0}); placeBuilding(s,'house',{x:-7,z:0})
  const sim=new Simulation(s); advance(sim,2)
  assert.ok(s.buildings.filter(b=>!b.complete).every(b=>b.work===0))
  advance(sim,130)
  assert.ok(s.buildings.every(b=>b.complete))
  for(const b of stockpiles(s)) assert.ok(available(s,b,'wood')>=0 && freeStorage(s,b)>=0)
  assert.equal(s.totals.delivered.wood,40)
})
test('full storage pauses gathering and new construction releases capacity', () => {
  const s=createInitialWorldState()
  s.buildings[0].inventory={wood:300,food:100}
  s.targets.wood=350
  const sim=new Simulation(s); advance(sim,2)
  assert.equal(s.jobs.length,0)
  assert.ok(s.settlers.every(a=>a.status.includes('Storage full')))
  placeBuilding(s,'stockpile',{x:7,z:0}); advance(sim,70)
  assert.ok(s.buildings.every(b=>b.complete)); assert.ok(s.totals.deposited.wood>0)
})
test('placement rejects overlap, resource occupation, actors, out of bounds, blocked entrance and route closures', () => {
  const s=createInitialWorldState()
  for(const p of [{x:0,z:0},{x:-19,z:-19},{x:0,z:5},{x:23,z:23},{x:0,z:3}]) assert.ok(placementError(s,'house',p),JSON.stringify(p))
  assert.equal(placeBuilding(s,'house',{x:7,z:0}),null)
  assert.ok(placementError(s,'house',{x:7,z:3}))
  const wall=createInitialWorldState()
  for(const [x,z] of [[7,0],[4,2],[10,2]]) assert.equal(placeBuilding(wall,'house',{x,z}),null)
  assert.match(placementError(wall,'house',{x:7,z:4}), /connected/)
})
test('topology changes invalidate routes and workers finish around new obstacles', () => {
  const s=createInitialWorldState(), sim=new Simulation(s)
  advance(sim,5)
  assert.equal(placeBuilding(s,'house',{x:5,z:6}),null)
  advance(sim,150)
  assert.ok(s.buildings.every(b=>b.complete)); assert.equal(sim.navigation.failures,0)
})
test('exhausted nodes and no storage space do not create invalid work', () => {
  const s=createInitialWorldState(); s.nodes.forEach(n=>n.remaining=0)
  const sim=new Simulation(s); advance(sim,3)
  assert.equal(s.jobs.length,0); assert.ok(s.settlers.every(a=>a.status==='No resources left'))
  validateWorld(s)
})
test('cancelling a blueprint releases reservations and refunds in-flight materials without loss', () => {
  const s=createInitialWorldState()
  s.buildings[0].inventory.wood=30
  const initial=total(s,'wood')
  assert.equal(placeBuilding(s,'house',{x:7,z:0}),null)
  const site=s.buildings.at(-1)
  const sim=new Simulation(s)
  let carrying=false
  for(let i=0;i<800;i++) {
    sim.step()
    if(s.jobs.some(j=>j.kind==='deliver' && j.targetId===site.id && j.stage==='target')) { carrying=true; break }
  }
  assert.ok(carrying)
  assert.equal(cancelBuilding(s,site.id),null)
  assert.ok(!s.buildings.some(b=>b.id===site.id))
  assert.ok(!s.jobs.some(j=>j.targetId===site.id))
  assert.equal(total(s,'wood'),initial)
  validateWorld(s)
})
test('cancelling construction in progress returns delivered materials and clears the builder', () => {
  const s=createInitialWorldState()
  s.buildings[0].inventory.wood=20
  const initial=total(s,'wood')
  assert.equal(placeBuilding(s,'house',{x:7,z:0}),null)
  const site=s.buildings.at(-1)
  const sim=new Simulation(s)
  let building=false
  for(let i=0;i<1400;i++) {
    sim.step()
    if(site.work>0 && !site.complete) { building=true; break }
  }
  assert.ok(building)
  assert.equal(cancelBuilding(s,site.id),null)
  assert.equal(total(s,'wood'),initial)
  assert.ok(!s.jobs.some(j=>j.targetId===site.id))
  validateWorld(s)
})

test('cancellation refuses to destroy resources when storage cannot accept the refund', () => {
  const s=createInitialWorldState()
  s.buildings[0].inventory.wood=20
  assert.equal(placeBuilding(s,'house',{x:7,z:0}),null)
  const site=s.buildings.at(-1)
  const sim=new Simulation(s)
  for(let i=0;i<1400 && site.work===0;i++) sim.step()
  assert.ok(site.delivered.wood>0)
  s.buildings[0].inventory={wood:400,food:0}
  const before=JSON.stringify(s)
  assert.match(cancelBuilding(s,site.id),/free stockpile capacity/)
  assert.equal(JSON.stringify(s),before)
})
test('long-run M1 logistics conserves resources and stays valid', () => {
  const s=createInitialWorldState(); pop10(s)
  const initial={wood:total(s,'wood'),food:total(s,'food')}
  for (const [type,x,z] of [['house',-7,0],['house',7,0],['house',7,6],['stockpile',-7,6]]) assert.equal(placeBuilding(s,type,{x,z}),null)
  const sim=new Simulation(s)
  for(let i=0;i<12000;i++) {
    sim.step()
    if(i%500===0) validateWorld(s)
  }
  validateWorld(s)
  assert.equal(total(s,'wood'),initial.wood)
  assert.equal(total(s,'food'),initial.food)
  assert.equal(sim.navigation.failures,0)
})


test('stock targets bound routine gathering while construction demand can exceed them', () => {
  const s=createInitialWorldState()
  s.targets={wood:25,food:0}
  const sim=new Simulation(s)
  advance(sim,70)
  const stores=stockpiles(s)
  assert.equal(stores.reduce((n,b)=>n+b.inventory.wood,0),25)
  assert.equal(s.totals.gathered.wood,25)
  assert.equal(s.totals.gathered.food,0)
  assert.ok(s.settlers.every(a=>a.status==='Stock targets met'))

  const build=createInitialWorldState()
  build.targets={wood:0,food:0}
  assert.equal(placeBuilding(build,'house',{x:7,z:0}),null)
  const buildSim=new Simulation(build)
  advance(buildSim,100)
  assert.ok(build.buildings.every(b=>b.complete))
  assert.equal(build.totals.delivered.wood,20)
})

test('legacy M1 saves migrate default stock targets without changing version', () => {
  const s=createInitialWorldState()
  const legacy=JSON.parse(serializeWorld(s))
  delete legacy.targets
  const loaded=deserializeWorld(JSON.stringify(legacy))
  assert.deepEqual(loaded.targets,DEFAULT_TARGETS)
  assert.equal(loaded.version,1)
  validateWorld(loaded)
})

test('blocked routes back off instead of retrying every tick and recover after topology changes', () => {
  const s=createInitialWorldState(), sim=new Simulation(s)
  sim.step()
  const worker=s.settlers.find(a=>a.jobId!==null)
  assert.ok(worker)
  const blocker={
    id:s.nextId++, type:'house', x:Math.round(worker.x), z:Math.round(worker.z),
    complete:true, work:12, inventory:{wood:0,food:0}, delivered:{wood:20,food:0},
  }
  s.buildings.push(blocker); s.topology++
  for(let i=0;i<5;i++) sim.step()
  const firstFailures=sim.navigation.failures
  assert.ok(firstFailures>0)
  for(let i=0;i<20;i++) sim.step()
  assert.equal(sim.navigation.failures,firstFailures)
  s.buildings.splice(s.buildings.findIndex(b=>b.id===blocker.id),1); s.topology++
  for(let i=0;i<80;i++) sim.step()
  assert.equal(sim.navigation.failures,firstFailures)
  assert.notEqual(worker.status,'Route blocked — retrying')
})

test('invalid and incompatible saves are rejected without touching current state', () => {
  const s=createInitialWorldState(), original=serializeWorld(s)
  for(const mutate of [
    s=>s.version=99, s=>s.settlers[0].x=Infinity, s=>s.buildings[0].inventory.wood=-1,
    s=>s.nextId=1, s=>s.settlers[0].jobId=999, s=>s.settlers[0].cargo.wood=5,
    s=>s.nodes[0].resource='iron', s=>s.buildings[0].complete=false, s=>s.targets.wood=-1,
  ]) {
    const candidate=JSON.parse(original);mutate(candidate)
    assert.throws(()=>deserializeWorld(JSON.stringify(candidate)))
  }
  assert.throws(()=>deserializeWorld('{bad json'))
  assert.equal(serializeWorld(s),original)
})
