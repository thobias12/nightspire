import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { createInitialWorldState, createBuilding, spawnSettler, DEFAULT_NEEDS, DEFAULT_TARGETS } = require('../.test-build/game/simulation/WorldState.js')
const { Simulation } = require('../.test-build/game/simulation/Simulation.js')
const { assignHousing, cancelBuilding, placeBuilding, placementError, stockpiles, available, freeStorage } = require('../.test-build/game/simulation/Buildings.js')
const { serializeWorld, deserializeWorld, validateWorld } = require('../.test-build/game/simulation/SaveLoad.js')
const { blockedCells, cellKey } = require('../.test-build/game/simulation/Navigation.js')
const { PATH_BUDGET } = require('../.test-build/game/data/jobs.js')
const { phaseForTime } = require('../.test-build/game/simulation/DayNight.js')
const { assignedGuardPost } = require('../.test-build/game/simulation/Schedule.js')
const { RAID_SIZE, RAID_MAX_SIZE, raidSizeForWave, enemyTarget, enemyTargetBuilding } = require('../.test-build/game/simulation/Raid.js')
const { PLAYER_DAMAGE, PLAYER_ATTACK_RANGE, RAIDER_DAMAGE, damageBuilding } = require('../.test-build/game/simulation/Combat.js')
const { happinessOf, recreationAssignment, serveDailyMeal, settlementNeeds, updateNeeds } = require('../.test-build/game/simulation/Needs.js')
const advance = (sim, seconds) => {
  for (let i = 0; i < seconds * 20; i++) {
    sim.step()
    assert.ok(sim.navigation.solved <= PATH_BUDGET)
    if (i % 100 === 0) validateWorld(sim.state)
  }
}
const total = (s, r) => s.nodes.filter(n => n.resource === r).reduce((v,n) => v+n.remaining,0) +
  s.buildings.reduce((v,b) => v+b.inventory[r]+b.delivered[r],0) + s.settlers.reduce((v,a) => v+a.cargo[r],0)
const accountedTotal = (s, r) => total(s,r) + (r === 'wood' ? s.totals.repairWoodUsed : s.totals.foodConsumed)
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
  assert.equal(accountedTotal(s,'wood'),initial.wood); assert.equal(accountedTotal(s,'food'),initial.food)
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
    for(const r of ['wood','food']) assert.equal(accountedTotal(loaded,r),accountedTotal(s,r),stage+' '+r)
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
  assert.equal(accountedTotal(s,'wood'),initial.wood)
  assert.equal(accountedTotal(s,'food'),initial.food)
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
  const blocker=createBuilding(s.nextId++,'house',Math.round(worker.x),Math.round(worker.z),true)
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


test('day phase boundaries are deterministic', () => {
  assert.equal(phaseForTime(5/24),'dawn')
  assert.equal(phaseForTime(6/24),'day')
  assert.equal(phaseForTime(17.999/24),'day')
  assert.equal(phaseForTime(18/24),'dusk')
  assert.equal(phaseForTime(20/24),'night')
  assert.equal(phaseForTime(4.999/24),'night')
})

test('dusk stops non-carrying work but lets carried resources reach storage', () => {
  const s=createInitialWorldState()
  const sim=new Simulation(s)
  let carrier=null
  for(let i=0;i<1200 && !carrier;i++) {
    sim.step()
    carrier=s.settlers.find(a=>{
      const j=s.jobs.find(j=>j.id===a.jobId)
      return j && j.stage==='target' && a.cargo[j.resource]>0
    })
  }
  assert.ok(carrier)
  const carriedBefore=carrier.cargo.wood+carrier.cargo.food
  assert.ok(carriedBefore>0)
  sim.setTimeOfDay(18/24)
  assert.ok(s.jobs.every(j=>j.stage==='target'))
  assert.ok(s.jobs.every(j=>{ const a=s.settlers.find(a=>a.id===j.settlerId); return j.stage==='target' && a && a.cargo[j.resource]===j.amount }))
  for(let i=0;i<800 && s.jobs.length>0;i++) sim.step()
  assert.equal(s.jobs.length,0)
  assert.equal(carrier.cargo.wood+carrier.cargo.food,0)
  sim.step()
  assert.ok(carrier.status==='Seeking shelter' || carrier.status==='Sheltering at camp' || carrier.status==='Sheltering at home')
  validateWorld(s)
})

test('guards report to completed guard posts at night while civilians seek shelter', () => {
  const s=createInitialWorldState()
  s.buildings[0].inventory.wood=25
  assert.equal(placeBuilding(s,'guard-post',{x:7,z:0}),null)
  const post=s.buildings.at(-1)
  post.delivered.wood=25
  post.work=10
  post.complete=true
  s.settlers[0].role='guard'
  s.raid.lastSpawnDay=s.day
  const sim=new Simulation(s)
  sim.setTimeOfDay(21/24)
  const assignment=assignedGuardPost(s,s.settlers[0])
  assert.ok(assignment)
  assert.equal(assignment.buildingId,post.id)
  for(let i=0;i<400;i++) sim.step()
  assert.equal(s.settlers[0].status,'Guarding the settlement')
  assert.ok(s.settlers.slice(1).every(a=>a.status==='Sheltering at camp' || a.status==='Seeking shelter'))
  validateWorld(s)
})

test('daylight resumes normal work after night schedule', () => {
  const s=createInitialWorldState()
  const sim=new Simulation(s)
  sim.setTimeOfDay(21/24)
  for(let i=0;i<80;i++) sim.step()
  assert.equal(s.jobs.length,0)
  sim.setTimeOfDay(6/24)
  for(let i=0;i<20;i++) sim.step()
  assert.ok(s.jobs.length>0)
  assert.ok(s.settlers.some(a=>a.status.includes('Travel') || a.status.includes('Gather') || a.status.includes('Carrying')))
})

test('legacy M1.1 saves migrate settler roles to worker', () => {
  const s=createInitialWorldState()
  const legacy=JSON.parse(serializeWorld(s))
  for(const settler of legacy.settlers) delete settler.role
  const loaded=deserializeWorld(JSON.stringify(legacy))
  assert.ok(loaded.settlers.every(a=>a.role==='worker'))
  validateWorld(loaded)
})


test('night spawns one deterministic raid per day and does not duplicate it', () => {
  const s=createInitialWorldState(), sim=new Simulation(s)
  sim.setTimeOfDay(21/24)
  assert.equal(s.enemies.length,RAID_SIZE)
  assert.equal(s.raid.wave,1)
  assert.equal(s.raid.totalSpawned,RAID_SIZE)
  assert.equal(s.raid.lastSpawnDay,1)
  const ids=s.enemies.map(e=>e.id)
  sim.setTimeOfDay(22/24)
  assert.deepEqual(s.enemies.map(e=>e.id),ids)

  sim.setTimeOfDay(12/24)
  assert.equal(s.enemies.length,0)
  sim.setTimeOfDay(21/24)
  assert.equal(s.enemies.length,0)
  assert.equal(s.raid.wave,1)
})

test('raid pressure scales from 20 to 40 and caps deterministically', () => {
  assert.deepEqual([1,2,3,4,5,6,7].map(raidSizeForWave),[20,24,28,32,36,40,40])
  assert.equal(RAID_SIZE,20)
  assert.equal(RAID_MAX_SIZE,40)
})

test('a capped 40-raider wave stays inside the shared path budget', () => {
  const s=createInitialWorldState()
  s.raid.wave=5
  const sim=new Simulation(s)
  sim.setTimeOfDay(21/24)
  assert.equal(s.enemies.length,40)
  assert.equal(s.raid.wave,6)
  for(let i=0;i<800;i++) {
    sim.step()
    assert.ok(sim.navigation.solved<=PATH_BUDGET)
    if(i%100===0) validateWorld(s)
  }
  validateWorld(s)
  assert.equal(sim.navigation.failures,0)
})

test('raiders share the bounded navigation queue and reach the settlement', () => {
  const s=createInitialWorldState(), sim=new Simulation(s)
  sim.setTimeOfDay(21/24)
  const initial=s.enemies.reduce((n,e)=>n+Math.hypot(e.x-enemyTarget(s,e).x,e.z-enemyTarget(s,e).z),0)
  for(let i=0;i<600;i++) {
    sim.step()
    assert.ok(sim.navigation.solved<=PATH_BUDGET)
    if(i%100===0) validateWorld(s)
  }
  const after=s.enemies.reduce((n,e)=>n+Math.hypot(e.x-enemyTarget(s,e).x,e.z-enemyTarget(s,e).z),0)
  assert.ok(after<initial)
  assert.ok(s.enemies.every(e=>e.status.startsWith('Attacking ') || e.status.startsWith('Advancing on ') || e.status==='No settlement target'))
  assert.equal(sim.navigation.failures,0)
})

test('raiders retreat with daylight and a new day can spawn the next wave', () => {
  const s=createInitialWorldState(), sim=new Simulation(s)
  sim.setTimeOfDay(21/24)
  assert.equal(s.enemies.length,RAID_SIZE)
  sim.setTimeOfDay(5/24)
  assert.equal(s.enemies.length,0)
  assert.equal(s.raid.wave,1)

  s.day=2
  sim.setTimeOfDay(12/24)
  sim.setTimeOfDay(21/24)
  assert.equal(s.enemies.length,raidSizeForWave(2))
  assert.equal(s.raid.wave,2)
  assert.equal(s.raid.totalSpawned,raidSizeForWave(1)+raidSizeForWave(2))
  assert.equal(s.raid.lastSpawnDay,2)
  validateWorld(s)
})

test('active raids survive save load without duplicate spawning', () => {
  const s=createInitialWorldState(), sim=new Simulation(s)
  sim.setTimeOfDay(21/24)
  for(let i=0;i<80;i++) sim.step()
  const saved=serializeWorld(s)
  const loaded=deserializeWorld(saved)
  assert.equal(loaded.enemies.length,RAID_SIZE)
  assert.deepEqual(loaded.raid,s.raid)
  assert.ok(loaded.enemies.every(e=>e.path.length===0 && e.pathRevision===-1))
  const ids=loaded.enemies.map(e=>e.id)
  const resumed=new Simulation(loaded)
  assert.deepEqual(loaded.enemies.map(e=>e.id),ids)
  assert.equal(loaded.raid.totalSpawned,RAID_SIZE)
  for(let i=0;i<80;i++) resumed.step()
  validateWorld(loaded)
})

test('legacy M2.0 saves migrate empty raid state', () => {
  const s=createInitialWorldState()
  const legacy=JSON.parse(serializeWorld(s))
  delete legacy.enemies
  delete legacy.raid
  const loaded=deserializeWorld(JSON.stringify(legacy))
  assert.deepEqual(loaded.enemies,[])
  assert.deepEqual(loaded.raid,{lastSpawnDay:0,wave:0,totalSpawned:0,totalDefeated:0,lastClearedWave:0})
  validateWorld(loaded)
})

test('building placement rejects an active raider cell', () => {
  const s=createInitialWorldState(), sim=new Simulation(s)
  sim.setTimeOfDay(21/24)
  const enemy=s.enemies[0]
  assert.ok(placementError(s,'house',{x:Math.round(enemy.x),z:Math.round(enemy.z)}))
})


test('player melee damages and defeats the nearest raider in range', () => {
  const s=createInitialWorldState(), sim=new Simulation(s)
  sim.setTimeOfDay(21/24)
  const enemy=s.enemies[0]
  s.player.x=enemy.x
  s.player.z=enemy.z+Math.min(1,PLAYER_ATTACK_RANGE/2)
  const first=sim.playerAttack()
  assert.equal(first.ok,true)
  assert.equal(first.killed,false)
  assert.equal(enemy.health,enemy.maxHealth-PLAYER_DAMAGE)
  for(let i=0;i<10;i++) sim.step()
  const second=sim.playerAttack()
  assert.equal(second.ok,true)
  assert.equal(second.killed,true)
  assert.ok(!s.enemies.some(e=>e.id===enemy.id))
  assert.equal(s.raid.totalDefeated,1)
  validateWorld(s)
})

test('a guard intercepts a nearby raider and both exchange melee damage', () => {
  const s=createInitialWorldState()
  s.settlers[0].role='guard'
  const sim=new Simulation(s)
  sim.setTimeOfDay(21/24)
  const guard=s.settlers[0], enemy=s.enemies[0]
  guard.x=0; guard.z=3
  enemy.x=0; enemy.z=4
  enemy.path=[]; enemy.pathRevision=-1
  for(let i=0;i<25;i++) sim.step()
  assert.ok(enemy.health<enemy.maxHealth || !s.enemies.includes(enemy))
  assert.ok(guard.health<guard.maxHealth)
  assert.ok(guard.status.includes('raider') || guard.status==='Defeated raider')
  validateWorld(s)
})

test('raider can down the player and night exit restores player health', () => {
  const s=createInitialWorldState(), sim=new Simulation(s)
  sim.setTimeOfDay(21/24)
  const enemy=s.enemies[0]
  s.player.health=RAIDER_DAMAGE
  s.player.x=enemy.x; s.player.z=enemy.z+1
  enemy.path=[]; enemy.pathRevision=-1
  for(let i=0;i<4 && s.player.health>0;i++) sim.step()
  assert.equal(s.player.health,0)
  sim.setTimeOfDay(12/24)
  assert.equal(s.player.health,s.player.maxHealth)
  assert.equal(s.enemies.length,0)
  validateWorld(s)
})

test('clearing the final raider records a cleared wave', () => {
  const s=createInitialWorldState(), sim=new Simulation(s)
  sim.setTimeOfDay(21/24)
  const enemy=s.enemies[0]
  s.enemies=[enemy]
  s.raid.totalSpawned=1
  s.player.x=enemy.x; s.player.z=enemy.z+1
  enemy.health=PLAYER_DAMAGE
  const result=sim.playerAttack()
  assert.equal(result.killed,true)
  assert.equal(s.enemies.length,0)
  assert.equal(s.raid.totalDefeated,1)
  assert.equal(s.raid.lastClearedWave,s.raid.wave)
  validateWorld(s)
})

test('combat health and cooldown survive save load', () => {
  const s=createInitialWorldState(), sim=new Simulation(s)
  sim.setTimeOfDay(21/24)
  const enemy=s.enemies[0]
  s.player.x=enemy.x; s.player.z=enemy.z+1
  sim.playerAttack()
  s.settlers[0].health=76
  s.settlers[0].attackCooldown=.4
  const loaded=deserializeWorld(serializeWorld(s))
  assert.equal(loaded.player.attackCooldown,s.player.attackCooldown)
  assert.equal(loaded.settlers[0].health,76)
  assert.equal(loaded.settlers[0].attackCooldown,.4)
  assert.equal(loaded.enemies[0].health,enemy.health)
  validateWorld(loaded)
})

test('legacy M2.1 saves migrate combat fields', () => {
  const s=createInitialWorldState(), sim=new Simulation(s)
  sim.setTimeOfDay(21/24)
  const legacy=JSON.parse(serializeWorld(s))
  delete legacy.player.health; delete legacy.player.maxHealth; delete legacy.player.attackCooldown
  for(const a of legacy.settlers) { delete a.health; delete a.maxHealth; delete a.attackCooldown }
  for(const e of legacy.enemies) { delete e.health; delete e.maxHealth; delete e.attackCooldown }
  delete legacy.raid.totalDefeated; delete legacy.raid.lastClearedWave
  const loaded=deserializeWorld(JSON.stringify(legacy))
  assert.equal(loaded.player.health,100)
  assert.ok(loaded.settlers.every(a=>a.health===100 && a.maxHealth===100 && a.attackCooldown===0))
  assert.ok(loaded.enemies.every(e=>e.health===40 && e.maxHealth===40 && e.attackCooldown===0))
  assert.equal(loaded.raid.totalDefeated,0)
  assert.equal(loaded.raid.lastClearedWave,0)
  validateWorld(loaded)
})


test('completed gate is passable to friendlies but blocks raiders while wall blocks both', () => {
  const s=createInitialWorldState()
  const gate=createBuilding(s.nextId++,'wood-gate',5,0,true)
  const wall=createBuilding(s.nextId++,'wood-wall',6,0,true)
  s.buildings.push(gate,wall); s.topology++
  const friendly=blockedCells(s,false), hostile=blockedCells(s,true)
  assert.equal(friendly.has(cellKey(gate)),false)
  assert.equal(hostile.has(cellKey(gate)),true)
  assert.equal(friendly.has(cellKey(wall)),true)
  assert.equal(hostile.has(cellKey(wall)),true)
  const blueprint=createBuilding(s.nextId++,'wood-wall',7,0,false)
  s.buildings.push(blueprint); s.topology++
  assert.equal(blockedCells(s,false).has(cellKey(blueprint)),true)
  assert.equal(blockedCells(s,true).has(cellKey(blueprint)),false)
  validateWorld(s)
})

test('new wooden wall construction finishes at full structure health', () => {
  const s=createInitialWorldState()
  s.buildings[0].inventory.wood=5
  assert.equal(placeBuilding(s,'wood-wall',{x:5,z:0}),null)
  const wall=s.buildings.at(-1)
  const sim=new Simulation(s)
  for(let i=0;i<1200 && !wall.complete;i++) sim.step()
  assert.equal(wall.complete,true)
  assert.equal(wall.health,wall.maxHealth)
  assert.equal(wall.destroyed,false)
  validateWorld(s)
})

test('raider destroys a wooden wall and the breach becomes hostile-walkable', () => {
  const s=createInitialWorldState()
  const wall=createBuilding(s.nextId++,'wood-wall',0,-5,true)
  s.buildings.push(wall); s.topology++
  const enemy={
    id:s.nextId++,kind:'raider',targetId:wall.id,
    health:40,maxHealth:40,attackCooldown:0,lastHitTick:0,
    x:0,z:-7,path:[],pathRevision:-1,status:'Test raider',
  }
  s.enemies=[enemy]
  s.raid={lastSpawnDay:s.day,wave:1,totalSpawned:1,totalDefeated:0,lastClearedWave:0}
  s.timeOfDay=21/24
  const sim=new Simulation(s)
  for(let i=0;i<500 && !wall.destroyed;i++) sim.step()
  assert.equal(wall.destroyed,true)
  assert.equal(wall.health,0)
  assert.ok(s.totals.structureDamage>=wall.maxHealth)
  assert.equal(blockedCells(s,true).has(cellKey(wall)),false)
  validateWorld(s)
})

test('daylight repair consumes timber, restores HP and closes a ruined wall breach', () => {
  const s=createInitialWorldState()
  s.buildings[0].inventory.wood=10
  const wall=createBuilding(s.nextId++,'wood-wall',5,0,true)
  wall.health=0; wall.destroyed=true
  s.buildings.push(wall); s.topology++
  const sim=new Simulation(s)
  for(let i=0;i<1400 && s.totals.repairedHealth===0;i++) sim.step()
  assert.equal(wall.destroyed,false)
  assert.equal(wall.health,50)
  assert.equal(s.totals.repairedHealth,50)
  assert.equal(s.totals.repairWoodUsed,5)
  assert.equal(blockedCells(s,true).has(cellKey(wall)),true)
  validateWorld(s)
})

test('core economy structures become critically damaged instead of disappearing', () => {
  const s=createInitialWorldState()
  const stock=s.buildings[0]
  const topology=s.topology
  assert.equal(damageBuilding(s,stock,9999),false)
  assert.equal(stock.health,1)
  assert.equal(stock.destroyed,false)
  assert.equal(s.topology,topology)
  assert.equal(s.totals.structureDamage,stock.maxHealth-1)
  validateWorld(s)
})


test('raiders retarget after a core building reaches its critical 1 HP floor', () => {
  const s=createInitialWorldState()
  const house=createBuilding(s.nextId++,'house',8,0,true)
  s.buildings.push(house); s.topology++
  const stock=s.buildings[0]
  damageBuilding(s,stock,9999)
  assert.equal(stock.health,1)
  const enemy={
    id:s.nextId++,kind:'raider',targetId:stock.id,
    health:40,maxHealth:40,attackCooldown:0,lastHitTick:0,
    x:4,z:0,path:[],pathRevision:-1,status:'Test raider',
  }
  s.enemies=[enemy]
  s.raid={lastSpawnDay:s.day,wave:1,totalSpawned:1,totalDefeated:0,lastClearedWave:0}
  const target=enemyTargetBuilding(s,enemy)
  assert.equal(target.id,house.id)
  assert.equal(enemy.targetId,house.id)
  validateWorld(s)
})

test('legacy M2.2 saves migrate structure health hit state and repair counters', () => {
  const s=createInitialWorldState()
  const legacy=JSON.parse(serializeWorld(s))
  for(const b of legacy.buildings) {
    delete b.health; delete b.maxHealth; delete b.destroyed; delete b.lastHitTick
  }
  delete legacy.player.lastHitTick
  for(const a of legacy.settlers) delete a.lastHitTick
  delete legacy.totals.repairedHealth
  delete legacy.totals.repairWoodUsed
  delete legacy.totals.structureDamage
  const loaded=deserializeWorld(JSON.stringify(legacy))
  assert.ok(loaded.buildings.every(b=>b.health===b.maxHealth && b.destroyed===false && b.lastHitTick===0))
  assert.equal(loaded.player.lastHitTick,0)
  assert.ok(loaded.settlers.every(a=>a.lastHitTick===0))
  assert.equal(loaded.totals.repairedHealth,0)
  assert.equal(loaded.totals.repairWoodUsed,0)
  assert.equal(loaded.totals.structureDamage,0)
  validateWorld(loaded)
})

test('daily meal consumes one food per due settler exactly once per day', () => {
  const s=createInitialWorldState()
  s.buildings[0].inventory.food=20
  for(const a of s.settlers) { a.needs.food=30; a.lastMealDay=0 }
  assert.deepEqual(serveDailyMeal(s),{served:6,missed:0})
  assert.equal(s.buildings[0].inventory.food,14)
  assert.equal(s.totals.foodConsumed,6)
  assert.ok(s.settlers.every(a=>a.needs.food===100 && a.lastMealDay===s.day))
  assert.deepEqual(serveDailyMeal(s),{served:0,missed:0})
  assert.equal(s.totals.foodConsumed,6)
  validateWorld(s)
})

test('food shortage leaves unfed settlers visibly worse instead of inventing food', () => {
  const s=createInitialWorldState()
  s.buildings[0].inventory.food=2
  for(const a of s.settlers) { a.needs.food=60; a.lastMealDay=0 }
  assert.deepEqual(serveDailyMeal(s),{served:2,missed:4})
  assert.equal(s.buildings[0].inventory.food,0)
  assert.equal(s.totals.foodConsumed,2)
  assert.equal(s.settlers.filter(a=>a.needs.food===100).length,2)
  assert.equal(s.settlers.filter(a=>a.needs.food===35).length,4)
  validateWorld(s)
})

test('one campfire serves six workers and restores recreation during off-hours', () => {
  const s=createInitialWorldState(); pop10(s)
  const fire=createBuilding(s.nextId++,'campfire',7,0,true)
  s.buildings.push(fire); s.topology++
  const assigned=s.settlers.filter(a=>recreationAssignment(s,a)!==null)
  assert.equal(assigned.length,6)
  const settler=assigned[0], assignment=recreationAssignment(s,settler)
  settler.x=assignment.target.x; settler.z=assignment.target.z
  settler.needs.recreation=20
  updateNeeds(s,5,'dusk')
  assert.ok(settler.needs.recreation>35)
  assert.equal(recreationAssignment(s,s.settlers[9]),null)
  validateWorld(s)
})

test('housing and active raids move needs toward real settlement conditions', () => {
  const s=createInitialWorldState()
  const settler=s.settlers[0]
  settler.needs.housing=80
  updateNeeds(s,10,'day')
  assert.ok(settler.needs.housing<80)

  const house=createBuilding(s.nextId++,'house',7,0,true)
  s.buildings.push(house); s.topology++; assignHousing(s)
  const beforeHousing=settler.needs.housing
  updateNeeds(s,10,'day')
  assert.ok(settler.needs.housing>beforeHousing)

  settler.needs.safety=80
  const sim=new Simulation(s)
  sim.setTimeOfDay(21/24)
  const beforeSafety=settler.needs.safety
  updateNeeds(s,10,'night')
  assert.ok(settler.needs.safety<beforeSafety)
})

test('happiness summary is derived from the four persisted needs', () => {
  const s=createInitialWorldState()
  for(const a of s.settlers) a.needs={food:80,housing:60,safety:40,recreation:20}
  assert.equal(happinessOf(s.settlers[0]),50)
  const summary=settlementNeeds(s)
  assert.equal(summary.happiness,50)
  assert.equal(summary.worst,'recreation')
  assert.deepEqual(summary.averages,{food:80,housing:60,safety:40,recreation:20})
})

test('entering Day serves the new-day meal before normal work resumes', () => {
  const s=createInitialWorldState()
  s.day=2
  s.timeOfDay=5/24
  s.buildings[0].inventory.food=10
  for(const a of s.settlers) { a.lastMealDay=1; a.needs.food=40 }
  const sim=new Simulation(s)
  sim.setTimeOfDay(6/24)
  assert.equal(s.totals.foodConsumed,6)
  assert.equal(s.buildings[0].inventory.food,4)
  assert.ok(s.settlers.every(a=>a.lastMealDay===2 && a.needs.food===100))
  validateWorld(s)
})

test('legacy M2.4 saves migrate settler needs and food accounting', () => {
  const s=createInitialWorldState()
  const legacy=JSON.parse(serializeWorld(s))
  for(const a of legacy.settlers) { delete a.needs; delete a.lastMealDay }
  delete legacy.totals.foodConsumed
  const loaded=deserializeWorld(JSON.stringify(legacy))
  assert.ok(loaded.settlers.every(a=>JSON.stringify(a.needs)===JSON.stringify(DEFAULT_NEEDS)))
  assert.ok(loaded.settlers.every(a=>a.lastMealDay===loaded.day))
  assert.equal(loaded.totals.foodConsumed,0)
  validateWorld(loaded)
})

test('off-hours phase changes discard stale campfire routes before sheltering', () => {
  const s=createInitialWorldState()
  const fire=createBuilding(s.nextId++,'campfire',7,0,true)
  s.buildings.push(fire); s.topology++
  const sim=new Simulation(s)
  sim.setTimeOfDay(18/24)
  const worker=s.settlers[0]
  worker.path=[{x:7,z:0}]
  worker.pathRevision=s.topology
  worker.jobId=null
  sim.setTimeOfDay(21/24)
  assert.deepEqual(worker.path,[])
  assert.equal(worker.pathRevision,-1)
})

test('invalid and incompatible saves are rejected without touching current state', () => {
  const s=createInitialWorldState(), original=serializeWorld(s)
  for(const mutate of [
    s=>s.version=99, s=>s.settlers[0].x=Infinity, s=>s.buildings[0].inventory.wood=-1,
    s=>s.nextId=1, s=>s.settlers[0].jobId=999, s=>s.settlers[0].cargo.wood=5,
    s=>s.nodes[0].resource='iron', s=>s.buildings[0].complete=false, s=>s.targets.wood=-1, s=>s.settlers[0].role='wizard',
    s=>s.buildings[0].health=s.buildings[0].maxHealth+1, s=>s.buildings[0].destroyed=true,
    s=>s.settlers[0].needs.food=101, s=>s.settlers[0].lastMealDay=s.day+1,
  ]) {
    const candidate=JSON.parse(original);mutate(candidate)
    assert.throws(()=>deserializeWorld(JSON.stringify(candidate)))
  }
  assert.throws(()=>deserializeWorld('{bad json'))
  assert.equal(serializeWorld(s),original)
})
