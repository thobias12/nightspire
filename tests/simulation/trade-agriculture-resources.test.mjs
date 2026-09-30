import * as fixture from './fixture.mjs'
const { FIELD_GROWTH_DAYS, FORESTER_TREE_TARGET, SAPLING_GROWTH_PER_DAY, Simulation, TRADE_PRICES, adjustTradeReserve, advance, agricultureSummary, assert, assignFieldsToFarmhouses, assignJobs, createBuilding, createField, createInitialWorldState, deserializeWorld, entrance, farmerFieldAssignment, fieldArea, fieldCentroid, fieldHarvestWork, fieldPlacementError, fieldSowWork, merchantIntervalDays, merchantPresent, nearestFarmhouseForField, placementError, pointInPolygon, processAgricultureDay, processForestryDay, processMerchantTrade, require, roadPlacementError, scheduleMerchantVisit, serializeWorld, serviceAssignments, serviceAvailable, staffWorkplace, stockpileAccepts, stockpiles, test, tradeExportStagingNeed, tradeFreeStorage, tradeReputation, updateResourceWorkplaces, validateWorld, workField } = fixture
const { activeWoodTreePoint, woodHarvestedTreeCount, woodVisualState } = require('../../.test-build/game/systems/economy/Woodcutting.js')

test('M3.11.6 new settlements use Gold and default every trade policy to Keep', () => {
  const s=createInitialWorldState()
  assert.equal(s.trade.gold,60)
  assert.equal(s.trade.nextMerchantDay,3)
  assert.equal(s.trade.merchantDay,0)
  assert.equal(s.trade.visits,0)
  for(const resource of ['wood','food','ale','ore','tools']) {
    assert.equal(s.trade.policies[resource].mode,'keep')
    assert.ok(s.trade.policies[resource].reserve>=0)
  }
  assert.equal(TRADE_PRICES.ale.sell,4)
  assert.equal(TRADE_PRICES.tools.buy,12)
  validateWorld(s)
})

test('M3.11.6 Laborers stage only export surplus above the reserve at a staffed Trading Post', () => {
  const s=createInitialWorldState()
  for(const settler of s.settlers) {
    settler.lastMealDay=s.day
    settler.needs={food:100,housing:100,safety:100,recreation:100}
  }
  s.targets={wood:0,food:0,ale:0,ore:0,tools:0}
  const store=s.buildings[0]
  store.inventory.ale=30
  const post=createBuilding(s.nextId++,'trading-post',7,0,true)
  s.buildings.push(post); s.topology++
  staffWorkplace(s,post,1)
  s.trade.policies.ale={mode:'export',reserve:20}

  assert.equal(tradeExportStagingNeed(s,post,'ale'),10)
  assert.equal(tradeFreeStorage(s,post),60)
  assignJobs(s)
  const staged=s.jobs.filter(j=>j.kind==='supply' && j.sourceId===store.id && j.targetId===post.id && j.resource==='ale')
  assert.ok(staged.length>0)
  assert.ok(staged.reduce((sum,j)=>sum+j.amount,0)<=10)

  s.trade.policies.ale.reserve=30
  const withReservations=tradeExportStagingNeed(s,post,'ale')
  assert.equal(withReservations,0)
  validateWorld(s)
})

test('M3.11.6 merchant caravan sells staged exports for Gold exactly once per visit', () => {
  const s=createInitialWorldState()
  const post=createBuilding(s.nextId++,'trading-post',7,0,true)
  post.inventory.ale=10
  s.buildings.push(post); s.topology++
  staffWorkplace(s,post,1)
  s.trade.policies.ale={mode:'export',reserve:10}
  s.day=3
  s.trade.nextMerchantDay=3
  const startGold=s.trade.gold

  assert.equal(scheduleMerchantVisit(s),true)
  assert.equal(merchantPresent(s),true)
  assert.equal(processMerchantTrade(s),true)
  assert.equal(post.inventory.ale,0)
  assert.equal(s.trade.gold,startGold+10*TRADE_PRICES.ale.sell)
  assert.equal(s.trade.exported.ale,10)
  assert.equal(s.trade.goldEarned,40)
  assert.equal(s.trade.lastTransactionDay,3)
  assert.equal(processMerchantTrade(s),false)
  validateWorld(s)
})

test('M3.11.6 imports spend Gold into Trading Post cargo and Laborers unload it to stockpiles', () => {
  const s=createInitialWorldState()
  for(const settler of s.settlers) {
    settler.lastMealDay=s.day
    settler.needs={food:100,housing:100,safety:100,recreation:100}
  }
  s.targets={wood:0,food:0,ale:0,ore:0,tools:0}
  const store=s.buildings[0]
  store.inventory.food=0
  const post=createBuilding(s.nextId++,'trading-post',7,0,true)
  s.buildings.push(post); s.topology++
  staffWorkplace(s,post,1)
  s.trade.gold=60
  s.trade.policies.food={mode:'import',reserve:20}
  s.day=3
  s.trade.nextMerchantDay=3

  scheduleMerchantVisit(s)
  assert.equal(processMerchantTrade(s),true)
  assert.equal(post.inventory.food,20)
  assert.equal(s.trade.gold,0)
  assert.equal(s.trade.imported.food,20)
  assert.equal(s.trade.goldSpent,60)

  assignJobs(s)
  assert.ok(s.jobs.some(j=>j.kind==='supply' && j.sourceId===post.id && j.targetId===store.id && j.resource==='food'))
  validateWorld(s)
})

test('M3.11.6 prosperous homes improve trade reputation and shorten caravan interval', () => {
  const s=createInitialWorldState()
  const a=createBuilding(s.nextId++,'house',-7,0,true)
  const b=createBuilding(s.nextId++,'house',7,0,true)
  a.houseLevel=3
  b.houseLevel=3
  s.buildings.push(a,b); s.topology++
  assert.equal(tradeReputation(s),4)
  assert.equal(merchantIntervalDays(s),2)

  a.houseLevel=2
  b.houseLevel=1
  assert.equal(tradeReputation(s),1)
  assert.equal(merchantIntervalDays(s),3)
  validateWorld(s)
})

test('M3.11.6 trade reserve controls clamp safely and old saves migrate to Gold defaults', () => {
  const s=createInitialWorldState()
  assert.equal(adjustTradeReserve(s,'tools',-999),0)
  assert.equal(adjustTradeReserve(s,'tools',999),500)
  const loaded=deserializeWorld(serializeWorld(s))
  assert.equal(loaded.trade.gold,60)
  assert.equal(loaded.trade.policies.tools.reserve,500)

  const legacy=JSON.parse(serializeWorld(createInitialWorldState()))
  delete legacy.trade
  const migrated=deserializeWorld(JSON.stringify(legacy))
  assert.equal(migrated.trade.gold,60)
  assert.equal(migrated.trade.nextMerchantDay,3)
  assert.ok(Object.values(migrated.trade.policies).every(policy=>policy.mode==='keep'))

  const invalid=JSON.parse(serializeWorld(s))
  invalid.trade.policies.wood.mode='dump'
  assert.throws(()=>deserializeWorld(JSON.stringify(invalid)),/trade state/)
  validateWorld(loaded)
})


test('M3.11.7 point-drawn fields support irregular Manor Lords-style polygons', () => {
  const s=createInitialWorldState()
  for(const node of s.nodes) node.remaining=0
  const points=[
    {x:8,z:8},
    {x:17,z:7},
    {x:19,z:13},
    {x:14,z:17},
    {x:8,z:15},
  ]
  const farmhouse=createBuilding(s.nextId++,'farmhouse',4,11,true)
  s.buildings.push(farmhouse)
  s.topology++
  assert.equal(fieldPlacementError(points,[],s.buildings,[],s.nodes,[]),null)
  assert.equal(nearestFarmhouseForField(points,s.buildings).id,farmhouse.id)
  const field=createField(s.nextId++,points,farmhouse.id)
  assert.ok(fieldArea(points)>40)
  assert.ok(pointInPolygon(fieldCentroid(points),points))
  assert.equal(field.points.length,5)
  assert.ok(field.yield>=8)
  s.fields.push(field)
  validateWorld(s)
})

test('M3.11.7 fields require a nearby Farmhouse and bind to it at placement', () => {
  const s=createInitialWorldState()
  for(const node of s.nodes) node.remaining=0
  const points=[{x:10,z:8},{x:16,z:8},{x:16,z:13},{x:10,z:13}]
  assert.match(fieldPlacementError(points,[],s.buildings,[],s.nodes,[]),/Farmhouse within 18m/i)

  const far=createBuilding(s.nextId++,'farmhouse',-20,-20,true)
  s.buildings.push(far)
  assert.match(fieldPlacementError(points,[],s.buildings,[],s.nodes,[]),/Farmhouse within 18m/i)

  const near=createBuilding(s.nextId++,'farmhouse',6,10,true)
  s.buildings.push(near)
  assert.equal(fieldPlacementError(points,[],s.buildings,[],s.nodes,[]),null)
  assert.equal(nearestFarmhouseForField(points,s.buildings).id,near.id)

  const field=createField(s.nextId++,points,near.id)
  assert.equal(field.farmhouseId,near.id)
  s.fields.push(field)
  validateWorld(s)
})

test('M3.11.7 field placement rejects crossings, occupied land and later road/building intrusion', () => {
  const s=createInitialWorldState()
  for(const node of s.nodes) node.remaining=0
  const points=[{x:8,z:8},{x:16,z:8},{x:16,z:14},{x:8,z:14}]
  const field=createField(s.nextId++,points)
  s.fields.push(field)

  assert.match(fieldPlacementError(
    [{x:12,z:10},{x:20,z:10},{x:20,z:16},{x:12,z:16}],
    s.fields,s.buildings,s.residentialPlots,s.nodes,s.roads,
  ),/overlap/i)
  assert.match(placementError(s,'farmhouse',{x:12,z:11}),/farm field/i)
  assert.match(roadPlacementError([{x:5,z:11},{x:20,z:11}],s.fields),/farm field/i)

  const selfCross=[{x:-20,z:8},{x:-12,z:14},{x:-20,z:14},{x:-12,z:8}]
  assert.match(fieldPlacementError(selfCross,s.fields,s.buildings,s.residentialPlots,s.nodes,s.roads),/edges cannot cross/i)
  validateWorld(s)
})

test('M3.11.7 Farmers physically target fields and complete sowing work', () => {
  const s=createInitialWorldState()
  for(const node of s.nodes) node.remaining=0
  const farmhouse=createBuilding(s.nextId++,'farmhouse',7,0,true)
  const field=createField(s.nextId++,[
    {x:10,z:3},{x:16,z:3},{x:16,z:8},{x:10,z:8},
  ])
  s.buildings.push(farmhouse)
  s.fields.push(field)
  s.topology++
  const [farmer]=staffWorkplace(s,farmhouse,1)
  assignFieldsToFarmhouses(s)
  assert.equal(field.farmhouseId,farmhouse.id)
  assert.equal(farmerFieldAssignment(s,farmhouse,farmer).id,field.id)

  const sim=new Simulation(s)
  advance(sim,12)
  assert.equal(field.phase,'sown')
  assert.match(farmer.status,/field|Farmhouse/i)
  validateWorld(s)
})

test('M3.11.7 crops grow across Days then harvest into Farmhouse Food storage', () => {
  const s=createInitialWorldState()
  const farmhouse=createBuilding(s.nextId++,'farmhouse',7,0,true)
  const field=createField(s.nextId++,[
    {x:10,z:3},{x:16,z:3},{x:16,z:8},{x:10,z:8},
  ])
  s.buildings.push(farmhouse)
  s.fields.push(field)
  s.topology++
  staffWorkplace(s,farmhouse,1)
  assignFieldsToFarmhouses(s)

  const producedBefore=s.totals.produced.food
  assert.equal(workField(s,farmhouse,field,fieldSowWork(field),1),'Sown field '+field.id)
  assert.equal(field.phase,'sown')

  s.day=2
  processAgricultureDay(s)
  assert.equal(field.phase,'growing')
  assert.equal(field.growthDays,1)

  s.day=3
  processAgricultureDay(s)
  assert.equal(field.growthDays,FIELD_GROWTH_DAYS)
  assert.equal(field.phase,'ready')

  assert.equal(workField(s,farmhouse,field,fieldHarvestWork(field),1),'Harvested field '+field.id)
  assert.equal(field.phase,'harvested')
  assert.equal(farmhouse.inventory.food,field.yield)
  assert.equal(s.totals.produced.food,producedBefore+field.yield)

  s.day=4
  processAgricultureDay(s)
  assert.equal(field.phase,'fallow')
  validateWorld(s)
})

test('M3.11.7 a full Farmhouse blocks harvest until Laborers create storage space', () => {
  const s=createInitialWorldState()
  const farmhouse=createBuilding(s.nextId++,'farmhouse',7,0,true)
  const field=createField(s.nextId++,[
    {x:10,z:3},{x:16,z:3},{x:16,z:8},{x:10,z:8},
  ])
  field.phase='ready'
  field.lastGrowthDay=s.day
  farmhouse.inventory.food=60
  s.buildings.push(farmhouse)
  s.fields.push(field)
  s.topology++
  staffWorkplace(s,farmhouse,1)
  assignFieldsToFarmhouses(s)

  assert.equal(workField(s,farmhouse,field,fieldHarvestWork(field),1),'Farmhouse Food store full')
  assert.equal(field.phase,'ready')
  assert.equal(field.work,0)
  farmhouse.inventory.food=0
  workField(s,farmhouse,field,fieldHarvestWork(field),1)
  assert.equal(field.phase,'harvested')
  validateWorld(s)
})

test('M3.11.7 harvested Farmhouse Food is hauled into accepting Stockpiles', () => {
  const s=createInitialWorldState()
  for(const settler of s.settlers) {
    settler.lastMealDay=s.day
    settler.needs={food:100,housing:100,safety:100,recreation:100}
  }
  s.targets={wood:0,food:0,ale:0,ore:0,tools:0}
  const farmhouse=createBuilding(s.nextId++,'farmhouse',7,0,true)
  farmhouse.inventory.food=24
  s.buildings.push(farmhouse)
  s.topology++
  staffWorkplace(s,farmhouse,1)

  assignJobs(s)
  const job=s.jobs.find(job=>job.kind==='supply' && job.sourceId===farmhouse.id && job.resource==='food')
  assert.ok(job)
  assert.equal(job.targetId,s.buildings[0].id)
  validateWorld(s)
})

test('M3.11.7 field state persists and old saves migrate with no farm fields', () => {
  const s=createInitialWorldState()
  const farmhouse=createBuilding(s.nextId++,'farmhouse',7,0,true)
  const field=createField(s.nextId++,[
    {x:10,z:3},{x:16,z:3},{x:16,z:8},{x:10,z:8},
  ])
  field.phase='growing'
  field.growthDays=1
  field.lastGrowthDay=s.day
  field.farmhouseId=farmhouse.id
  s.buildings.push(farmhouse)
  s.fields.push(field)
  s.topology++

  const loaded=deserializeWorld(serializeWorld(s))
  assert.equal(loaded.fields.length,1)
  assert.equal(loaded.fields[0].phase,'growing')
  assert.equal(loaded.fields[0].farmhouseId,farmhouse.id)

  const legacy=JSON.parse(serializeWorld(createInitialWorldState()))
  delete legacy.fields
  const migrated=deserializeWorld(JSON.stringify(legacy))
  assert.deepEqual(migrated.fields,[])
  validateWorld(loaded)
})

test('M3.11.7 agriculture summary exposes field stages and Farmhouse Food', () => {
  const s=createInitialWorldState()
  const farmhouse=createBuilding(s.nextId++,'farmhouse',7,0,true)
  farmhouse.inventory.food=12
  const fallow=createField(s.nextId++,[{x:10,z:3},{x:15,z:3},{x:15,z:7},{x:10,z:7}])
  const ready=createField(s.nextId++,[{x:17,z:3},{x:22,z:3},{x:22,z:7},{x:17,z:7}])
  ready.phase='ready'
  s.buildings.push(farmhouse)
  s.fields.push(fallow,ready)
  s.topology++
  assignFieldsToFarmhouses(s)

  const summary=agricultureSummary(s)
  assert.equal(summary.fields,2)
  assert.equal(summary.phases.fallow,1)
  assert.equal(summary.phases.ready,1)
  assert.equal(summary.farmFood,12)
  assert.equal(summary.expected,ready.yield)
  validateWorld(s)
})


test('Foresters, Miners and Fishers run staffed resource operations with bounded workplace buffers', () => {
  const state = createInitialWorldState()
  const worker = state.settlers[0]
  const target = { x: 8, z: 8 }
  worker.x = target.x
  worker.z = target.z + 2

  const lodge = createBuilding(state.nextId++, 'foresters-lodge', target.x, target.z, true)
  state.buildings.push(lodge)
  worker.workplaceId = lodge.id
  const lodgeDoor = entrance(lodge)
  worker.x = lodgeDoor.x; worker.z = lodgeDoor.z
  const tree = { id: state.nextId++, x: target.x + 4, z: target.z, resource: 'wood', remaining: 40 }
  state.nodes.push(tree)
  assignJobs(state)
  const foresterJob = state.jobs.find(job => job.settlerId === worker.id)
  assert.ok(foresterJob)
  assert.equal(foresterJob.kind, 'gather')
  assert.equal(foresterJob.resource, 'wood')
  assert.equal(foresterJob.sourceId, tree.id)
  assert.equal(foresterJob.targetId, lodge.id)
  assert.equal(tree.remaining, 40)
  assert.equal(lodge.inventory.wood, 0)

  updateResourceWorkplaces(state, 18, 'day')
  assert.equal(tree.remaining, 40)
  assert.equal(lodge.inventory.wood, 0)

  state.jobs = state.jobs.filter(job => job.settlerId !== worker.id)
  worker.jobId = null
  worker.path = []
  worker.pathRevision = -1

  const mine = createBuilding(state.nextId++, 'mine', -8, 8, true)
  state.buildings.push(mine)
  worker.workplaceId = mine.id
  const mineDoor = entrance(mine)
  worker.x = mineDoor.x; worker.z = mineDoor.z
  const ore = { id: state.nextId++, x: -4, z: 8, resource: 'ore', remaining: 3 }
  state.nodes.push(ore)
  updateResourceWorkplaces(state, 24, 'day')
  assert.equal(mine.inventory.ore, 1)
  assert.equal(ore.remaining, 2)

  const fishery = createBuilding(state.nextId++, 'fishing-hut', -8, -8, true)
  state.buildings.push(fishery)
  worker.workplaceId = fishery.id
  const fishDoor = entrance(fishery)
  worker.x = fishDoor.x; worker.z = fishDoor.z
  updateResourceWorkplaces(state, 18, 'day')
  assert.equal(fishery.inventory.food, 1)
  assert.ok(fishery.inventory.food <= 24)
})

test('Foresters replant exhausted tree stands and managed saplings mature over multiple days', () => {
  const state = createInitialWorldState()
  state.nodes = []
  const lodge = createBuilding(state.nextId++, 'foresters-lodge', 8, 8, true)
  state.buildings.push(lodge)
  const exhausted = { id: state.nextId++, x: 12, z: 8, resource: 'wood', remaining: 0 }
  state.nodes.push(exhausted)

  processForestryDay(state)
  assert.equal(exhausted.planted, true)
  assert.ok(exhausted.growth >= 0.15)
  assert.ok(state.nodes.filter(node => node.resource === 'wood' && Math.hypot(node.x - lodge.x, node.z - lodge.z) <= 26).length <= FORESTER_TREE_TARGET)

  exhausted.growth = 1 - SAPLING_GROWTH_PER_DAY
  processForestryDay(state)
  assert.equal(exhausted.growth, 1)
  assert.equal(exhausted.remaining, 18)

  const restored = deserializeWorld(serializeWorld(state))
  assert.equal(restored.nodes.find(node => node.id === exhausted.id).planted, true)
  assert.equal(restored.nodes.find(node => node.id === exhausted.id).remaining, 18)
})

test('physical woodcutting treats a resource node as a small stand of individual timber trees', () => {
  const node={id:900,x:4,z:4,resource:'wood',remaining:40}
  const standing=woodVisualState(node)
  assert.equal(standing.stage,'standing')
  assert.equal(standing.treeCount,8)
  assert.equal(standing.harvestedTrees,0)
  const firstTree=activeWoodTreePoint(node)

  const job={
    id:901,kind:'gather',settlerId:1,sourceId:node.id,targetId:2,
    resource:'wood',amount:5,stage:'work',progress:2.8,
  }
  const falling=woodVisualState(node,job)
  assert.equal(falling.stage,'felling')
  assert.ok(falling.fallProgress>0 && falling.fallProgress<1)

  job.progress=4.2
  const debranching=woodVisualState(node,job)
  assert.equal(debranching.stage,'debranching')
  assert.ok(debranching.debranchProgress>0)

  node.remaining=35
  assert.equal(woodHarvestedTreeCount(node),1)
  assert.notDeepEqual(activeWoodTreePoint(node),firstTree)
  assert.equal(woodVisualState(node).stage,'standing')

  node.remaining=0
  const cleared=woodVisualState(node)
  assert.equal(cleared.stage,'stump')
  assert.equal(cleared.harvestedTrees,8)

  const managed={id:902,x:5,z:5,resource:'wood',remaining:18,planted:true,growth:1}
  assert.equal(woodVisualState(managed).treeCount,4)
})

test('Forester physically fells a reserved tree and returns a five-wood batch to the lodge', () => {
  const state=createInitialWorldState()
  state.nodes=[]
  state.targets={wood:0,food:0,ale:0,ore:0,tools:0}
  const lodge=createBuilding(state.nextId++,'foresters-lodge',8,8,true)
  state.buildings.push(lodge)
  const worker=state.settlers[0]
  worker.workplaceId=lodge.id
  const lodgeDoor=entrance(lodge)
  worker.x=lodgeDoor.x; worker.z=lodgeDoor.z
  const tree={id:state.nextId++,x:12,z:8,resource:'wood',remaining:40}
  state.nodes.push(tree)

  assignJobs(state)
  const job=state.jobs.find(candidate=>candidate.settlerId===worker.id)
  assert.ok(job)
  assert.equal(job.kind,'gather')
  assert.equal(job.amount,5)
  assert.equal(job.targetId,lodge.id)

  const sim=new Simulation(state)
  worker.x=tree.x; worker.z=tree.z
  job.stage='work'
  job.progress=5
  sim.step()
  assert.equal(tree.remaining,35)
  assert.equal(worker.cargo.wood,5)
  assert.equal(job.stage,'target')
  assert.equal(woodVisualState(tree).stage,'trunk')

  worker.x=lodgeDoor.x; worker.z=lodgeDoor.z
  worker.path=[]
  worker.pathRevision=-1
  sim.step()
  assert.equal(lodge.inventory.wood,5)
  assert.equal(worker.cargo.wood,0)
  assert.equal(worker.jobId,null)
  validateWorld(state)
})

test('Ore Yard is dedicated mineral storage and Pleasure House is a staffed safe-night service', () => {
  const state = createInitialWorldState()
  const yard = createBuilding(state.nextId++, 'ore-yard', 8, 8, true)
  state.buildings.push(yard)
  assert.equal(stockpileAccepts(yard, 'ore'), true)
  assert.equal(stockpileAccepts(yard, 'wood'), false)
  assert.equal(stockpileAccepts(yard, 'food'), false)

  const pleasure = createBuilding(state.nextId++, 'pleasure-house', -8, -8, true)
  state.buildings.push(pleasure)
  pleasure.inventory.ale = 4
  const host = state.settlers[0]
  host.workplaceId = pleasure.id
  const door = entrance(pleasure)
  host.x = door.x; host.z = door.z
  assert.equal(serviceAvailable(pleasure, state), true)
  assert.ok(serviceAssignments(state, 'night').size > 0)

  state.enemies.push({ id: state.nextId++, kind: 'raider', targetId: 0, x: 0, z: 0, health: 10, maxHealth: 10, attackCooldown: 0, lastHitTick: 0, path: [], pathRevision: -1, status: 'Raid' })
  assert.equal(serviceAssignments(state, 'night').size, 0)
})
