import * as fixture from './fixture.mjs'
const { MARKET_COVERAGE_RADIUS, RECREATION_COVERAGE_RADIUS, SERVICE_COVERAGE_RADIUS, assert, assignHousing, assignJobs, assignWorkerToWorkplace, compareStockpileDestinations, completedMarkets, createBuilding, createInitialWorldState, demolishBuilding, deserializeWorld, houseBedCapacity, houseProgressionStatus, householdStatus, householdSummary, makeAttractive, marketFoodNeed, marketFoodTarget, marketMealCapacity, marketMealsRemaining, marketSummary, nextHaulPriority, nextStockpilePriority, populationAttraction, processHouseholdProgression, professionLabel, serializeWorld, serveDailyMeal, serviceAssignments, spawnSettler, staffWorkplace, stockpileAccepts, stockpiles, test, updateProduction, validateWorld, workplaceHaulScore, workplaceInputNeed, workplaceInputTarget, workplaceOutputReady, workplaceOutputThreshold, workplaceStaffing } = fixture

test('M3.11 workplaces enforce slots and expose persistent professions', () => {
  const s=createInitialWorldState()
  const brewery=createBuilding(s.nextId++,'brewery',7,0,true)
  s.buildings.push(brewery); s.topology++
  const first=assignWorkerToWorkplace(s,brewery.id)
  const second=assignWorkerToWorkplace(s,brewery.id)
  const third=assignWorkerToWorkplace(s,brewery.id)
  assert.equal(first.ok,true)
  assert.equal(second.ok,true)
  assert.equal(third.ok,false)
  assert.equal(workplaceStaffing(s,brewery).assigned,2)
  assert.equal(professionLabel(s,s.settlers.find(a=>a.id===first.settlerId)),'Brewer')
  validateWorld(s)
})

test('M3.11 production pauses unstaffed and scales with workers physically present', () => {
  const s=createInitialWorldState()
  const brewery=createBuilding(s.nextId++,'brewery',7,0,true)
  brewery.inventory.food=4
  s.buildings.push(brewery); s.topology++

  updateProduction(s,12,'day')
  assert.equal(brewery.productionProgress,0)
  assert.equal(brewery.inventory.ale,0)

  staffWorkplace(s,brewery,1)
  updateProduction(s,12,'day')
  assert.equal(brewery.productionProgress,6)
  assert.equal(brewery.inventory.ale,0)

  staffWorkplace(s,brewery,1)
  updateProduction(s,6,'day')
  assert.equal(brewery.productionProgress,0)
  assert.equal(brewery.inventory.food,2)
  assert.equal(brewery.inventory.ale,4)
  validateWorld(s)
})

test('M3.11 dedicated workplace staff stop taking new general jobs', () => {
  const s=createInitialWorldState()
  const brewery=createBuilding(s.nextId++,'brewery',7,0,true)
  s.buildings.push(brewery); s.topology++
  const worker=s.settlers[0]
  worker.workplaceId=brewery.id
  assignJobs(s)
  assert.equal(worker.jobId,null)
  assert.ok(s.settlers.slice(1).some(a=>a.jobId!==null))
  validateWorld(s)
})

test('M3.11 workplace assignment survives save load and old saves migrate to laborers', () => {
  const s=createInitialWorldState()
  const brewery=createBuilding(s.nextId++,'brewery',7,0,true)
  s.buildings.push(brewery); s.topology++
  assert.equal(assignWorkerToWorkplace(s,brewery.id).ok,true)
  const assigned=s.settlers.find(a=>a.workplaceId===brewery.id)
  const loaded=deserializeWorld(serializeWorld(s))
  assert.equal(loaded.settlers.find(a=>a.id===assigned.id).workplaceId,brewery.id)

  const legacy=JSON.parse(serializeWorld(createInitialWorldState()))
  for(const settler of legacy.settlers) delete settler.workplaceId
  const migrated=deserializeWorld(JSON.stringify(legacy))
  assert.ok(migrated.settlers.every(a=>a.workplaceId===null))
  validateWorld(loaded)
  validateWorld(migrated)
})

test('M3.11 demolishing a workplace releases its staff to the labor pool', () => {
  const s=createInitialWorldState()
  const brewery=createBuilding(s.nextId++,'brewery',7,0,true)
  s.buildings.push(brewery); s.topology++
  const result=assignWorkerToWorkplace(s,brewery.id)
  assert.equal(result.ok,true)
  const worker=s.settlers.find(a=>a.id===result.settlerId)
  assert.equal(demolishBuilding(s,brewery.id),null)
  assert.equal(worker.workplaceId,null)
  assert.equal(professionLabel(s,worker),'Laborer')
  validateWorld(s)
})


test('M3.11.1 hauling priority changes local workplace reserve and pickup thresholds', () => {
  const s=createInitialWorldState()
  const brewery=createBuilding(s.nextId++,'brewery',7,0,true)
  s.buildings.push(brewery); s.topology++

  brewery.haulPriority='low'
  assert.equal(workplaceInputTarget(brewery),2)
  assert.equal(workplaceOutputThreshold(brewery),20)
  assert.equal(workplaceHaulScore(brewery),275)
  assert.equal(nextHaulPriority('low'),'normal')

  brewery.haulPriority='normal'
  assert.equal(workplaceInputTarget(brewery),8)
  assert.equal(workplaceOutputThreshold(brewery),8)
  assert.equal(workplaceHaulScore(brewery),310)
  assert.equal(nextHaulPriority('normal'),'high')

  brewery.haulPriority='high'
  assert.equal(workplaceInputTarget(brewery),20)
  assert.equal(workplaceOutputThreshold(brewery),4)
  assert.equal(workplaceHaulScore(brewery),340)
  assert.equal(nextHaulPriority('high'),'low')
  validateWorld(s)
})

test('M3.11.1 unstaffed workplaces do not pull production inputs and staffed normal priority reserves a local buffer', () => {
  const s=createInitialWorldState()
  for(const settler of s.settlers) {
    settler.lastMealDay=s.day
    settler.needs={food:100,housing:100,safety:100,recreation:100}
  }
  const stockpile=s.buildings[0]
  stockpile.inventory.food=100
  const brewery=createBuilding(s.nextId++,'brewery',7,0,true)
  s.buildings.push(brewery); s.topology++

  assert.equal(workplaceInputNeed(s,brewery,'food'),0)
  assignJobs(s)
  assert.equal(s.jobs.some(j=>j.kind==='supply' && j.targetId===brewery.id && j.resource==='food'),false)

  for(const settler of s.settlers) { settler.jobId=null; settler.path=[]; settler.pathRevision=-1; settler.cargo={wood:0,food:0,ale:0,ore:0,tools:0} }
  s.jobs=[]
  staffWorkplace(s,brewery)
  assert.equal(workplaceInputNeed(s,brewery,'food'),8)
  assignJobs(s)
  const inbound=s.jobs.filter(j=>j.kind==='supply' && j.targetId===brewery.id && j.resource==='food').reduce((sum,j)=>sum+j.amount,0)
  assert.equal(inbound,8)
  assert.equal(workplaceInputNeed(s,brewery,'food'),0)
  validateWorld(s)
})

test('M3.11.1 output waits in local storage until the priority pickup threshold', () => {
  const s=createInitialWorldState()
  const brewery=createBuilding(s.nextId++,'brewery',7,0,true)
  s.buildings.push(brewery); s.topology++

  brewery.inventory.ale=4
  assert.equal(workplaceOutputReady(s,brewery),0)

  brewery.inventory.ale=8
  assert.equal(workplaceOutputReady(s,brewery),8)

  brewery.haulPriority='high'
  brewery.inventory.ale=4
  assert.equal(workplaceOutputReady(s,brewery),4)

  brewery.haulPriority='low'
  brewery.inventory.ale=16
  assert.equal(workplaceOutputReady(s,brewery),0)
  brewery.inventory.ale=20
  assert.equal(workplaceOutputReady(s,brewery),20)
  validateWorld(s)
})

test('M3.11.1 high workplace hauling outranks construction while low priority yields to construction', () => {
  const makeWorld = priority => {
    const s=createInitialWorldState()
    s.settlers=s.settlers.slice(0,2)
    for(const settler of s.settlers) {
      settler.lastMealDay=s.day
      settler.needs={food:100,housing:100,safety:100,recreation:100}
    }
    const stockpile=s.buildings[0]
    stockpile.inventory.food=100
    stockpile.inventory.wood=100
    const brewery=createBuilding(s.nextId++,'brewery',7,0,true)
    brewery.haulPriority=priority
    const house=createBuilding(s.nextId++,'house',-7,0,false)
    s.buildings.push(brewery,house); s.topology++
    staffWorkplace(s,brewery,1)
    return {s,brewery,house}
  }

  const high=makeWorld('high')
  assignJobs(high.s)
  const highLaborer=high.s.settlers.find(a=>a.workplaceId===null)
  const highJob=high.s.jobs.find(j=>j.settlerId===highLaborer.id)
  assert.equal(highJob.kind,'supply')
  assert.equal(highJob.targetId,high.brewery.id)

  const low=makeWorld('low')
  assignJobs(low.s)
  const lowLaborer=low.s.settlers.find(a=>a.workplaceId===null)
  const lowJob=low.s.jobs.find(j=>j.settlerId===lowLaborer.id)
  assert.equal(lowJob.kind,'deliver')
  assert.equal(lowJob.targetId,low.house.id)
})

test('M3.11.1 hauling priority persists and older saves migrate to Normal', () => {
  const s=createInitialWorldState()
  const brewery=createBuilding(s.nextId++,'brewery',7,0,true)
  brewery.haulPriority='high'
  s.buildings.push(brewery); s.topology++

  const loaded=deserializeWorld(serializeWorld(s))
  assert.equal(loaded.buildings.find(b=>b.id===brewery.id).haulPriority,'high')

  const legacy=JSON.parse(serializeWorld(s))
  for(const building of legacy.buildings) delete building.haulPriority
  const migrated=deserializeWorld(JSON.stringify(legacy))
  assert.ok(migrated.buildings.every(b=>b.haulPriority==='normal'))

  const invalid=JSON.parse(serializeWorld(s))
  invalid.buildings.find(b=>b.id===brewery.id).haulPriority='critical'
  assert.throws(()=>deserializeWorld(JSON.stringify(invalid)),/building state/)
})


test('M3.11.2 stockpiles default to all resources at Normal priority and persist specialization', () => {
  const s=createInitialWorldState()
  const starter=s.buildings[0]
  assert.equal(starter.stockpilePriority,'normal')
  assert.deepEqual(starter.stockpileFilters,{wood:true,food:true,ale:true,ore:true,tools:true})
  assert.equal(nextStockpilePriority('normal'),'high')

  starter.stockpilePriority='high'
  starter.stockpileFilters.food=false
  starter.stockpileFilters.ale=false
  const loaded=deserializeWorld(serializeWorld(s))
  const restored=loaded.buildings[0]
  assert.equal(restored.stockpilePriority,'high')
  assert.equal(restored.stockpileFilters.food,false)
  assert.equal(restored.stockpileFilters.ale,false)
  assert.equal(stockpileAccepts(restored,'wood'),true)
  assert.equal(stockpileAccepts(restored,'food'),false)

  const legacy=JSON.parse(serializeWorld(createInitialWorldState()))
  for(const building of legacy.buildings) {
    delete building.stockpilePriority
    delete building.stockpileFilters
  }
  const migrated=deserializeWorld(JSON.stringify(legacy))
  assert.ok(migrated.buildings.every(b=>b.stockpilePriority==='normal'))
  assert.ok(migrated.buildings.every(b=>Object.values(b.stockpileFilters).every(Boolean)))

  const invalid=JSON.parse(serializeWorld(s))
  invalid.buildings[0].stockpilePriority='urgent'
  assert.throws(()=>deserializeWorld(JSON.stringify(invalid)),/building state/)
})

test('M3.11.2 gather deliveries respect stockpile resource filters', () => {
  const s=createInitialWorldState()
  s.settlers=s.settlers.slice(0,1)
  const worker=s.settlers[0]
  worker.lastMealDay=s.day
  worker.needs={food:100,housing:100,safety:100,recreation:100}
  s.targets={wood:50,food:0,ale:0,ore:0,tools:0}

  const starter=s.buildings[0]
  starter.stockpileFilters.wood=false
  const timberYard=createBuilding(s.nextId++,'stockpile',10,0,true)
  timberYard.stockpileFilters.food=false
  timberYard.stockpileFilters.ale=false
  timberYard.stockpileFilters.ore=false
  timberYard.stockpileFilters.tools=false
  s.buildings.push(timberYard); s.topology++

  assignJobs(s)
  const job=s.jobs.find(j=>j.settlerId===worker.id)
  assert.equal(job.kind,'gather')
  assert.equal(job.resource,'wood')
  assert.equal(job.targetId,timberYard.id)
  validateWorld(s)
})

test('M3.11.2 receiving priority is chosen before distance within valid stockpiles', () => {
  const s=createInitialWorldState()
  const starter=s.buildings[0]
  const far=createBuilding(s.nextId++,'stockpile',18,0,true)
  starter.stockpilePriority='normal'
  far.stockpilePriority='high'
  s.buildings.push(far); s.topology++

  const origin={x:0,z:0}
  assert.ok(compareStockpileDestinations(far,starter,origin)<0)

  s.settlers=s.settlers.slice(0,1)
  const worker=s.settlers[0]
  worker.lastMealDay=s.day
  worker.needs={food:100,housing:100,safety:100,recreation:100}
  s.targets={wood:50,food:0,ale:0,ore:0,tools:0}
  assignJobs(s)
  const job=s.jobs.find(j=>j.settlerId===worker.id)
  assert.equal(job.kind,'gather')
  assert.equal(job.targetId,far.id)
})

test('M3.11.2 manufactured output uses only accepting stockpiles while existing rejected stock stays usable', () => {
  const s=createInitialWorldState()
  for(const settler of s.settlers) {
    settler.lastMealDay=s.day
    settler.needs={food:100,housing:100,safety:100,recreation:100}
  }
  const starter=s.buildings[0]
  starter.inventory.wood=40
  starter.stockpileFilters.ale=false
  starter.stockpileFilters.wood=false

  const aleStore=createBuilding(s.nextId++,'stockpile',10,0,true)
  aleStore.stockpileFilters.wood=false
  aleStore.stockpileFilters.food=false
  aleStore.stockpileFilters.ore=false
  aleStore.stockpileFilters.tools=false
  aleStore.stockpilePriority='high'

  const brewery=createBuilding(s.nextId++,'brewery',-7,0,true)
  brewery.inventory.ale=8
  const house=createBuilding(s.nextId++,'house',-10,0,false)
  s.buildings.push(aleStore,brewery,house); s.topology++

  assignJobs(s)
  assert.ok(s.jobs.some(j=>j.kind==='supply' && j.sourceId===brewery.id && j.targetId===aleStore.id && j.resource==='ale'))
  assert.equal(s.jobs.some(j=>j.kind==='supply' && j.sourceId===brewery.id && j.targetId===starter.id && j.resource==='ale'),false)
  assert.ok(s.jobs.some(j=>j.kind==='deliver' && j.sourceId===starter.id && j.targetId===house.id && j.resource==='wood'))
  validateWorld(s)
})


test('M3.11.3 camp rations remain stockpile-backed until the first Market is complete', () => {
  const s=createInitialWorldState()
  s.day=2
  for(const settler of s.settlers) settler.lastMealDay=1
  const stockpile=s.buildings[0]
  stockpile.inventory.food=10

  let result=serveDailyMeal(s)
  assert.equal(result.served,s.settlers.length)
  assert.equal(stockpile.inventory.food,10-s.settlers.length)

  for(const settler of s.settlers) settler.lastMealDay=1
  const blueprint=createBuilding(s.nextId++,'market',7,0,false)
  s.buildings.push(blueprint); s.topology++
  stockpile.inventory.food=10
  result=serveDailyMeal(s)
  assert.equal(result.served,s.settlers.length)
  assert.equal(stockpile.inventory.food,10-s.settlers.length)
  validateWorld(s)
})

test('M3.11.3 completed Market replaces direct stockpile meals and requires active Vendors', () => {
  const s=createInitialWorldState()
  s.day=2
  for(const settler of s.settlers) settler.lastMealDay=1
  const stockpile=s.buildings[0]
  stockpile.inventory.food=20
  const market=createBuilding(s.nextId++,'market',7,0,true)
  market.inventory.food=20
  s.buildings.push(market); s.topology++

  let result=serveDailyMeal(s)
  assert.deepEqual(result,{served:0,missed:s.settlers.length})
  assert.equal(stockpile.inventory.food,20)
  assert.equal(market.inventory.food,20)

  staffWorkplace(s,market,1)
  assert.equal(marketMealCapacity(s,market),5)
  result=serveDailyMeal(s)
  assert.equal(result.served,5)
  assert.equal(result.missed,1)
  assert.equal(market.inventory.food,15)
  assert.equal(market.distributionServed,5)
  assert.equal(marketMealsRemaining(s,market),0)

  result=serveDailyMeal(s)
  assert.deepEqual(result,{served:0,missed:1})

  staffWorkplace(s,market,1)
  assert.equal(marketMealCapacity(s,market),10)
  assert.equal(marketMealsRemaining(s,market),5)
  result=serveDailyMeal(s)
  assert.deepEqual(result,{served:1,missed:0})
  assert.ok(s.settlers.every(a=>a.lastMealDay===2))
  assert.equal(market.distributionServed,6)
  assert.equal(s.totals.foodConsumed,6)
  validateWorld(s)
})

test('M3.11.3 assigned Vendors create a two-day Food reserve supplied from stockpiles', () => {
  const s=createInitialWorldState()
  for(const settler of s.settlers) {
    settler.lastMealDay=s.day
    settler.needs={food:100,housing:100,safety:100,recreation:100}
  }
  const stockpile=s.buildings[0]
  stockpile.inventory.food=30
  const market=createBuilding(s.nextId++,'market',7,0,true)
  s.buildings.push(market); s.topology++
  staffWorkplace(s,market,2)

  assert.equal(marketFoodTarget(s,market),20)
  assert.equal(marketFoodNeed(s,market),20)
  assignJobs(s)
  const inbound=s.jobs
    .filter(j=>j.kind==='supply' && j.targetId===market.id && j.resource==='food')
    .reduce((sum,j)=>sum+j.amount,0)
  assert.equal(inbound,20)
  assert.equal(marketFoodNeed(s,market),0)
  assert.ok(s.jobs.filter(j=>j.targetId===market.id).every(j=>j.resource==='food'))
  validateWorld(s)
})

test('M3.11.3 Market Food counts toward settlement attraction reserves', () => {
  const s=makeAttractive(createInitialWorldState())
  const stockpile=s.buildings[0]
  const market=createBuilding(s.nextId++,'market',7,-7,true)
  s.buildings.push(market); s.topology++
  const required=s.settlers.length*2
  stockpile.inventory.food=0
  market.inventory.food=required
  staffWorkplace(s,market,2)

  const attraction=populationAttraction(s)
  assert.equal(attraction.food,required)
  assert.equal(attraction.foodRequired,required)
  assert.equal(attraction.eligible,true)
  validateWorld(s)
})

test('M3.11.3 Market distribution counters persist and older saves migrate safely', () => {
  const s=createInitialWorldState()
  const market=createBuilding(s.nextId++,'market',7,0,true)
  market.inventory.food=8
  market.distributionDay=s.day
  market.distributionServed=3
  s.buildings.push(market); s.topology++

  const loaded=deserializeWorld(serializeWorld(s))
  const restored=loaded.buildings.find(b=>b.id===market.id)
  assert.equal(restored.distributionDay,s.day)
  assert.equal(restored.distributionServed,3)
  assert.equal(restored.inventory.food,8)

  const legacy=JSON.parse(serializeWorld(createInitialWorldState()))
  for(const building of legacy.buildings) {
    delete building.distributionDay
    delete building.distributionServed
  }
  const migrated=deserializeWorld(JSON.stringify(legacy))
  assert.ok(migrated.buildings.every(b=>b.distributionDay===0 && b.distributionServed===0))
  validateWorld(migrated)
})

test('M3.11.3 Market summary exposes stocked and active distribution capacity', () => {
  const s=createInitialWorldState()
  const market=createBuilding(s.nextId++,'market',7,0,true)
  market.inventory.food=12
  s.buildings.push(market); s.topology++
  staffWorkplace(s,market,2)

  const summary=marketSummary(s)
  assert.equal(completedMarkets(s).length,1)
  assert.equal(summary.markets,1)
  assert.equal(summary.staffed,1)
  assert.equal(summary.active,1)
  assert.equal(summary.food,12)
  assert.equal(summary.capacity,20)
  assert.equal(summary.mealCapacity,10)
  assert.equal(summary.mealsServed,0)
  assert.equal(professionLabel(s,s.settlers.find(a=>a.workplaceId===market.id)),'Vendor')
  validateWorld(s)
})


test('M3.11.4 household status keeps camp rations before Markets and reports local recreation', () => {
  const s=createInitialWorldState()
  const house=createBuilding(s.nextId++,'house',7,0,true)
  const fire=createBuilding(s.nextId++,'campfire',7,7,true)
  s.buildings.push(house,fire); s.topology++
  assignHousing(s)

  const status=householdStatus(s,house)
  assert.equal(status.residents.length,4)
  assert.equal(status.foodAccess,true)
  assert.equal(status.foodAccessLabel,'Camp rations')
  assert.equal(status.recreationAccess,true)
  assert.equal(status.recreation.id,fire.id)
  assert.ok(status.recreationDistance<=RECREATION_COVERAGE_RADIUS)
  assert.equal(householdSummary(s).marketCovered,1)
  validateWorld(s)
})

test('M3.11.4 stocked staffed Markets only cover households inside the 18m catchment', () => {
  const s=makeAttractive(createInitialWorldState())
  const far=createBuilding(s.nextId++,'market',20,20,true)
  far.inventory.food=20
  s.buildings.push(far); s.topology++
  staffWorkplace(s,far,2)

  const summary=householdSummary(s)
  assert.equal(MARKET_COVERAGE_RADIUS,18)
  assert.equal(summary.occupied,2)
  assert.equal(summary.marketCovered,0)
  assert.ok(householdStatus(s,s.buildings.find(b=>b.type==='house')).foodAccess===false)

  const attraction=populationAttraction(s)
  assert.equal(attraction.marketCoveredHouseholds,0)
  assert.equal(attraction.households,2)
  assert.equal(attraction.eligible,false)
  assert.ok(attraction.blockers.some(blocker=>blocker.startsWith('Market coverage 0/2')))
})

test('M3.11.4 nearby stocked staffed Market restores household coverage and attraction', () => {
  const s=makeAttractive(createInitialWorldState())
  const market=createBuilding(s.nextId++,'market',0,-7,true)
  market.inventory.food=20
  s.buildings.push(market); s.topology++
  staffWorkplace(s,market,2)

  const summary=householdSummary(s)
  assert.equal(summary.occupied,2)
  assert.equal(summary.marketCovered,2)
  const attraction=populationAttraction(s)
  assert.equal(attraction.marketCoveredHouseholds,2)
  assert.equal(attraction.households,2)
  assert.equal(attraction.eligible,true)
  validateWorld(s)
})

test('M3.11.4 daily Market meals do not jump across uncovered neighborhoods', () => {
  const s=createInitialWorldState()
  s.day=2
  const nearHouse=createBuilding(s.nextId++,'house',7,0,true)
  const farHouse=createBuilding(s.nextId++,'house',-20,0,true)
  const market=createBuilding(s.nextId++,'market',7,-7,true)
  market.inventory.food=20
  s.buildings.push(nearHouse,farHouse,market); s.topology++
  assignHousing(s)
  for(const settler of s.settlers) settler.lastMealDay=1
  staffWorkplace(s,market,2)

  const result=serveDailyMeal(s)
  assert.deepEqual(result,{served:4,missed:2})
  assert.ok(s.settlers.filter(a=>a.homeId===nearHouse.id).every(a=>a.lastMealDay===2))
  assert.ok(s.settlers.filter(a=>a.homeId===farHouse.id).every(a=>a.lastMealDay===1))
  assert.equal(market.distributionServed,4)
  validateWorld(s)
})

test('M3.11.4 recreation service slots respect the same local household catchment', () => {
  const s=createInitialWorldState()
  const farHouse=createBuilding(s.nextId++,'house',-20,0,true)
  const fire=createBuilding(s.nextId++,'campfire',7,0,true)
  s.buildings.push(farHouse,fire); s.topology++
  assignHousing(s)

  assert.equal(SERVICE_COVERAGE_RADIUS,18)
  const assignments=serviceAssignments(s,'dusk')
  const housed=s.settlers.filter(a=>a.homeId===farHouse.id)
  const unhoused=s.settlers.filter(a=>a.homeId===null)
  assert.ok(housed.every(a=>!assignments.has(a.id)))
  assert.ok(unhoused.every(a=>assignments.has(a.id)))
  assert.equal(assignments.size,unhoused.length)
  assert.equal(householdStatus(s,farHouse).recreationAccess,false)
  validateWorld(s)
})

test('M3.11.4 empty or unstaffed Markets do not count as household Food access', () => {
  const s=createInitialWorldState()
  const house=createBuilding(s.nextId++,'house',7,0,true)
  const market=createBuilding(s.nextId++,'market',7,-7,true)
  s.buildings.push(house,market); s.topology++
  assignHousing(s)

  assert.equal(householdStatus(s,house).foodAccess,false)
  market.inventory.food=10
  assert.equal(householdStatus(s,house).foodAccess,false)
  staffWorkplace(s,market,1)
  assert.equal(householdStatus(s,house).foodAccess,true)
  market.inventory.food=0
  assert.equal(householdStatus(s,house).foodAccess,false)
  validateWorld(s)
})


test('M3.11.5 sustained household services promote Cottage to Established and Prosperous homes', () => {
  const s=createInitialWorldState()
  const house=createBuilding(s.nextId++,'house',7,0,true)
  const market=createBuilding(s.nextId++,'market',7,-7,true)
  const fire=createBuilding(s.nextId++,'campfire',7,7,true)
  market.inventory.food=20
  s.buildings.push(house,market,fire); s.topology++
  assignHousing(s)
  staffWorkplace(s,market,2)
  for(const settler of s.settlers) settler.needs={food:100,housing:100,safety:100,recreation:100}

  assert.equal(house.houseLevel,1)
  assert.equal(houseBedCapacity(house),4)
  assert.equal(houseProgressionStatus(s,house).qualifiesToday,true)

  assert.equal(processHouseholdProgression(s),0)
  assert.equal(house.houseQualifyingDays,1)
  assert.equal(processHouseholdProgression(s),0)
  assert.equal(house.houseQualifyingDays,1)

  s.day=2
  assert.equal(processHouseholdProgression(s),1)
  assert.equal(house.houseLevel,2)
  assert.equal(houseBedCapacity(house),5)
  assignHousing(s)
  assert.equal(s.settlers.filter(a=>a.homeId===house.id).length,5)

  for(const day of [3,4]) {
    s.day=day
    assert.equal(processHouseholdProgression(s),0)
  }
  assert.equal(house.houseQualifyingDays,2)
  s.day=5
  assert.equal(processHouseholdProgression(s),1)
  assert.equal(house.houseLevel,3)
  assert.equal(houseBedCapacity(house),6)
  assignHousing(s)
  assert.equal(s.settlers.filter(a=>a.homeId===house.id).length,6)
  assert.equal(houseProgressionStatus(s,house).next,null)
  validateWorld(s)
})

test('M3.11.5 losing a household requirement resets the current prosperity streak', () => {
  const s=createInitialWorldState()
  const house=createBuilding(s.nextId++,'house',7,0,true)
  const market=createBuilding(s.nextId++,'market',7,-7,true)
  const fire=createBuilding(s.nextId++,'campfire',7,7,true)
  market.inventory.food=20
  s.buildings.push(house,market,fire); s.topology++
  assignHousing(s)
  staffWorkplace(s,market,1)
  for(const settler of s.settlers) settler.needs={food:100,housing:100,safety:100,recreation:100}

  processHouseholdProgression(s)
  assert.equal(house.houseQualifyingDays,1)

  s.day=2
  market.inventory.food=0
  assert.equal(processHouseholdProgression(s),0)
  assert.equal(house.houseQualifyingDays,0)
  assert.ok(houseProgressionStatus(s,house).blockers.includes('No Market Food access'))

  s.day=3
  market.inventory.food=10
  assert.equal(processHouseholdProgression(s),0)
  assert.equal(house.houseQualifyingDays,1)
  assert.equal(house.houseLevel,1)
  validateWorld(s)
})

test('M3.11.5 housing reassignment keeps established households stable as capacity grows', () => {
  const s=createInitialWorldState()
  const first=createBuilding(s.nextId++,'house',-7,0,true)
  const second=createBuilding(s.nextId++,'house',7,0,true)
  s.buildings.push(first,second); s.topology++
  assignHousing(s)

  const secondResidents=s.settlers.filter(a=>a.homeId===second.id).map(a=>a.id)
  assert.equal(secondResidents.length,2)
  first.houseLevel=2
  assignHousing(s)

  assert.deepEqual(s.settlers.filter(a=>a.homeId===second.id).map(a=>a.id),secondResidents)
  assert.equal(s.settlers.filter(a=>a.homeId===first.id).length,4)
  assert.equal(houseBedCapacity(first),5)

  const newcomer=spawnSettler(s)
  assert.equal(newcomer,true)
  assignHousing(s)
  assert.equal(s.settlers.at(-1).homeId,first.id)
  validateWorld(s)
})

test('M3.11.5 upgraded bed capacity contributes to population attraction', () => {
  const s=createInitialWorldState()
  s.settlers=s.settlers.slice(0,4)
  const house=createBuilding(s.nextId++,'house',7,0,true)
  house.houseLevel=2
  s.buildings.push(house); s.topology++
  assignHousing(s)
  s.buildings[0].inventory.food=100
  for(const settler of s.settlers) settler.needs={food:100,housing:100,safety:100,recreation:100}

  const attraction=populationAttraction(s)
  assert.equal(houseBedCapacity(house),5)
  assert.equal(attraction.spareBeds,1)
  assert.equal(attraction.eligible,true)
  validateWorld(s)
})

test('M3.11.5 house prosperity state persists and older saves migrate to Cottage', () => {
  const s=createInitialWorldState()
  const house=createBuilding(s.nextId++,'house',7,0,true)
  house.houseLevel=2
  house.houseQualifyingDays=2
  house.houseLastEvaluationDay=s.day
  s.buildings.push(house); s.topology++

  const loaded=deserializeWorld(serializeWorld(s))
  const restored=loaded.buildings.find(b=>b.id===house.id)
  assert.equal(restored.houseLevel,2)
  assert.equal(restored.houseQualifyingDays,2)
  assert.equal(restored.houseLastEvaluationDay,s.day)

  const legacy=JSON.parse(serializeWorld(createInitialWorldState()))
  for(const building of legacy.buildings) {
    delete building.houseLevel
    delete building.houseQualifyingDays
    delete building.houseLastEvaluationDay
  }
  const migrated=deserializeWorld(JSON.stringify(legacy))
  assert.ok(migrated.buildings.filter(b=>b.type==='house').every(b=>b.houseLevel===1))
  assert.ok(migrated.buildings.filter(b=>b.type!=='house').every(b=>b.houseLevel===0))
  assert.ok(migrated.buildings.every(b=>b.houseQualifyingDays===0 && b.houseLastEvaluationDay===0))

  const invalid=JSON.parse(serializeWorld(s))
  invalid.buildings.find(b=>b.id===house.id).houseLevel=4
  assert.throws(()=>deserializeWorld(JSON.stringify(invalid)),/building state/)
  validateWorld(loaded)
})
