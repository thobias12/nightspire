import * as fixture from './fixture.mjs'
const {
  test,
  assert,
  createInitialWorldState,
  createBuilding,
  spawnSettler,
  DEFAULT_NEEDS,
  DEFAULT_TARGETS,
  MAX_SETTLERS,
  Simulation,
  assignHousing,
  cancelBuilding,
  demolishBuilding,
  placeBuilding,
  placeBuildingBatch,
  placementBatchError,
  placementError,
  stockpiles,
  available,
  freeStorage,
  wallLinePoints,
  assignJobs,
  canAdvanceConstruction,
  constructionCrewCapacity,
  constructionMaterialRatio,
  constructionStage,
  constructionWorkLimit,
  constructionWorkPoint,
  serializeWorld,
  deserializeWorld,
  validateWorld,
  blockedCells,
  cellKey,
  entrance,
  PATH_BUDGET,
  phaseForTime,
  assignedGuardPost,
  guardPostTarget,
  RAID_SIZE,
  RAID_MAX_SIZE,
  RAID_GROWTH,
  RAIDER_PROFILES,
  enemyTarget,
  enemyTargetBuilding,
  raidArchetypeForSpawn,
  raidFrontCountForWave,
  raidPlanForWave,
  raidSizeForWave,
  raiderArchetype,
  PLAYER_DAMAGE,
  PLAYER_ATTACK_RANGE,
  RAIDER_DAMAGE,
  GUARD_RANGED_DAMAGE,
  GUARD_RANGED_RANGE,
  damageBuilding,
  damageEnemy,
  happinessOf,
  serveDailyMeal,
  settlementNeeds,
  updateNeeds,
  canAcceptJob,
  happinessEffect,
  settlementHappinessEffect,
  workRateFor,
  SETTLERS_PER_TOOL,
  TOOL_WORK_BONUS_MAX,
  toolCoverage,
  IMMIGRATION_REQUIRED_DAYS,
  forceImmigrationIfEligible,
  populationAttraction,
  processImmigrationDay,
  updateProduction,
  FORESTER_TREE_TARGET,
  SAPLING_GROWTH_PER_DAY,
  processForestryDay,
  updateResourceWorkplaces,
  assignWorkerToWorkplace,
  professionLabel,
  workplaceStaffing,
  nextHaulPriority,
  workplaceHaulScore,
  workplaceInputNeed,
  workplaceInputTarget,
  workplaceOutputReady,
  workplaceOutputThreshold,
  compareStockpileDestinations,
  nextStockpilePriority,
  stockpileAccepts,
  completedMarkets,
  marketFoodNeed,
  marketFoodTarget,
  marketMealCapacity,
  marketMealsRemaining,
  marketSummary,
  MARKET_COVERAGE_RADIUS,
  householdStatus,
  householdSummary,
  RECREATION_COVERAGE_RADIUS,
  houseBedCapacity,
  houseProgressionStatus,
  processHouseholdProgression,
  CHILD_DAYS_PER_YEAR,
  FAMILY_CHILD_INTERVAL_DAYS,
  dependentCount,
  dependentCountAtHome,
  familySummary,
  processFamiliesDay,
  settlementPopulation,
  synchronizeFamilies,
  MERCHANT_UNIT_LIMIT,
  TRADE_PRICES,
  adjustTradeReserve,
  merchantIntervalDays,
  merchantPresent,
  processMerchantTrade,
  scheduleMerchantVisit,
  tradeExportStagingNeed,
  tradeFreeStorage,
  tradeReputation,
  createField,
  fieldArea,
  fieldCentroid,
  fieldPlacementError,
  nearestFarmhouseForField,
  pointInPolygon,
  FIELD_GROWTH_DAYS,
  agricultureSummary,
  assignFieldsToFarmhouses,
  farmerFieldAssignment,
  fieldHarvestWork,
  fieldSowWork,
  processAgricultureDay,
  workField,
  serviceAssignment,
  serviceAssignments,
  serviceAvailable,
  serviceSummary,
  updateServices,
  SERVICE_COVERAGE_RADIUS,
  atmosphereForTime,
  constructionVisualStage,
  damageVisualStage,
  visualRoadStrip,
  settlementMetrics,
  settlementTier,
  settlementTierStatus,
  residentialPresentationProfile,
  backyardForPlot,
  buildingPlacementPreview,
  buildingRequiresRoadFrontage,
  buildingRoadPlacementError,
  insertRoadJunctionPoint,
  normalizeRoadPoints,
  residentialPlotBuildingError,
  residentialPlotError,
  residentialPlotPreview,
  residentialPlotResourceError,
  roadLength,
  roadPlacementError,
  sampleRoadCurve,
  snapPointToGrid,
  snapRoadControlPoint,
  require,
  advance,
  total,
  accountedTotal,
  aleBalance,
  toolsBalance,
  pop10,
  makeAttractive,
  staffWorkplace
} = fixture

test('supplied Tavern outranks Campfire and exposes the stronger service to all ten settlers', () => {
  const s=createInitialWorldState(); pop10(s)
  const fire=createBuilding(s.nextId++,'campfire',-7,0,true)
  const tavern=createBuilding(s.nextId++,'tavern',7,0,true)
  tavern.inventory.ale=12
  s.buildings.push(fire,tavern); s.topology++
  const assignments=serviceAssignments(s,'dusk')
  assert.equal(assignments.size,10)
  assert.ok([...assignments.values()].every(a=>a.buildingId===tavern.id && a.label==='Tavern' && a.gainPerSecond===8))
  const summary=serviceSummary(s,'dusk')
  assert.equal(summary.providers,2)
  assert.equal(summary.suppliedProviders,2)
  assert.equal(summary.slots,18)
  validateWorld(s)
})

test('dry Tavern stops serving and settlers fall back to Campfire capacity', () => {
  const s=createInitialWorldState(); pop10(s)
  const fire=createBuilding(s.nextId++,'campfire',-7,0,true)
  const tavern=createBuilding(s.nextId++,'tavern',7,0,true)
  s.buildings.push(fire,tavern); s.topology++
  assert.equal(serviceAvailable(tavern),false)
  const assignments=serviceAssignments(s,'dusk')
  assert.equal(assignments.size,6)
  assert.ok([...assignments.values()].every(a=>a.buildingId===fire.id && a.label==='Campfire'))
  assert.equal(serviceSummary(s,'dusk').suppliedProviders,1)
  validateWorld(s)
})

test('day workers route Brewery Ale through stockpile storage before supplying the Tavern', () => {
  const s=createInitialWorldState()
  for(const settler of s.settlers) settler.lastMealDay=s.day
  const stockpile=s.buildings[0]
  stockpile.inventory.food=40
  const brewery=createBuilding(s.nextId++,'brewery',-7,0,true)
  const tavern=createBuilding(s.nextId++,'tavern',7,0,true)
  s.buildings.push(brewery,tavern); s.topology++
  staffWorkplace(s,brewery)
  const initialFood=accountedTotal(s,'food')
  const sim=new Simulation(s)
  let sawFoodSupply=false
  let sawBreweryToStockpile=false
  let sawStockpiledAle=false
  let sawStockpileToTavern=false
  let sawDirectBreweryToTavern=false
  for(let i=0;i<6000 && tavern.inventory.ale<12;i++) {
    sim.step()
    for(const job of s.jobs) {
      if(job.kind!=='supply') continue
      if(job.targetId===brewery.id && job.resource==='food') sawFoodSupply=true
      if(job.sourceId===brewery.id && job.targetId===stockpile.id && job.resource==='ale') sawBreweryToStockpile=true
      if(job.sourceId===stockpile.id && job.targetId===tavern.id && job.resource==='ale') sawStockpileToTavern=true
      if(job.sourceId===brewery.id && job.targetId===tavern.id && job.resource==='ale') sawDirectBreweryToTavern=true
    }
    if(stockpile.inventory.ale>0) sawStockpiledAle=true
    if(i%100===0) validateWorld(s)
  }
  assert.equal(sawFoodSupply,true)
  assert.equal(sawBreweryToStockpile,true)
  assert.equal(sawStockpiledAle,true)
  assert.equal(sawStockpileToTavern,true)
  assert.equal(sawDirectBreweryToTavern,false)
  assert.equal(tavern.inventory.ale,12)
  assert.ok(s.totals.produced.ale>=12)
  assert.ok(s.totals.productionConsumed.food>=6)
  assert.equal(accountedTotal(s,'food'),initialFood)
  assert.equal(aleBalance(s),0)
  validateWorld(s)
})

test('Ale supply cargo survives save load and resumes without duplication', () => {
  const s=createInitialWorldState()
  for(const settler of s.settlers) settler.lastMealDay=s.day
  const brewery=createBuilding(s.nextId++,'brewery',-7,0,true)
  const tavern=createBuilding(s.nextId++,'tavern',7,0,true)
  brewery.inventory.ale=10
  s.buildings.push(brewery,tavern); s.topology++
  const sim=new Simulation(s)
  let found=false
  for(let i=0;i<1200;i++) {
    sim.step()
    if(s.jobs.some(j=>j.kind==='supply' && j.resource==='ale' && j.stage==='target')) { found=true; break }
  }
  assert.equal(found,true)
  const before=aleBalance(s)
  const loaded=deserializeWorld(serializeWorld(s))
  const resumed=new Simulation(loaded)
  for(let i=0;i<1500 && loaded.buildings.find(b=>b.id===tavern.id).inventory.ale<10;i++) resumed.step()
  assert.equal(loaded.buildings.find(b=>b.id===tavern.id).inventory.ale,10)
  assert.equal(aleBalance(loaded),before)
  validateWorld(loaded)
})

test('Tavern Ale drains only while a visitor is actually using the service', () => {
  const s=createInitialWorldState()
  const tavern=createBuilding(s.nextId++,'tavern',7,0,true)
  tavern.inventory.ale=2
  s.buildings.push(tavern); s.topology++
  const settler=s.settlers[0]
  const assignment=serviceAssignment(s,settler,'dusk')
  settler.x=assignment.target.x; settler.z=assignment.target.z
  const before=settler.needs.recreation
  updateServices(s,14,'dusk')
  assert.equal(tavern.inventory.ale,2)
  assert.equal(s.totals.serviceConsumed.ale,0)
  assert.ok(settler.needs.recreation>before)
  updateServices(s,1,'dusk')
  assert.equal(tavern.inventory.ale,1)
  assert.equal(s.totals.serviceConsumed.ale,1)
  updateServices(s,30,'day')
  assert.equal(tavern.inventory.ale,1)
  assert.equal(s.totals.serviceConsumed.ale,1)
  validateWorld(s)
})

test('Tavern recreation is stronger and automatically falls back to Campfire when supplies run out', () => {
  const s=createInitialWorldState()
  const fire=createBuilding(s.nextId++,'campfire',-7,0,true)
  const tavern=createBuilding(s.nextId++,'tavern',7,0,true)
  tavern.inventory.ale=1
  s.buildings.push(fire,tavern); s.topology++
  const settler=s.settlers[0]
  settler.needs.recreation=10
  const tavernAssignment=serviceAssignment(s,settler,'dusk')
  assert.equal(tavernAssignment.label,'Tavern')
  settler.x=tavernAssignment.target.x; settler.z=tavernAssignment.target.z
  updateServices(s,5,'dusk')
  assert.ok(settler.needs.recreation>=50)
  updateServices(s,10,'dusk')
  assert.equal(tavern.inventory.ale,0)
  const fallback=serviceAssignment(s,settler,'dusk')
  assert.equal(fallback.label,'Campfire')
  assert.equal(fallback.buildingId,fire.id)
  validateWorld(s)
})

test('M3.1 saves migrate Ale inventories, Tavern pantry and historical service food', () => {
  const s=createInitialWorldState()
  const tavern=createBuilding(s.nextId++,'tavern',7,0,true)
  s.buildings.push(tavern); s.topology++
  const legacy=JSON.parse(serializeWorld(s))
  for(const b of legacy.buildings) {
    b.inventory.food = b.type==='tavern' ? 5 : b.inventory.food
    delete b.inventory.ale
    delete b.delivered.ale
    delete b.productionProgress
  }
  for(const a of legacy.settlers) delete a.cargo.ale
  delete legacy.targets.ale
  for(const key of ['gathered','deposited','delivered']) delete legacy.totals[key].ale
  delete legacy.totals.serviceConsumed
  delete legacy.totals.productionConsumed
  delete legacy.totals.produced
  legacy.totals.serviceFoodConsumed=3
  const loaded=deserializeWorld(JSON.stringify(legacy))
  const migratedTavern=loaded.buildings.find(b=>b.type==='tavern')
  assert.equal(migratedTavern.inventory.food,0)
  assert.equal(migratedTavern.inventory.ale,5)
  assert.ok(loaded.buildings.every(b=>b.productionProgress===0 && b.inventory.ale>=0 && b.delivered.ale===0))
  assert.ok(loaded.settlers.every(a=>a.cargo.ale===0))
  assert.equal(loaded.targets.ale,0)
  assert.equal(loaded.totals.serviceConsumed.food,3)
  assert.deepEqual(loaded.totals.productionConsumed,{wood:0,food:0,ale:0,ore:0,tools:0})
  assert.deepEqual(loaded.totals.produced,{wood:0,food:0,ale:0,ore:0,tools:0})
  validateWorld(loaded)
})

test('service pantry capacity is validated and cannot be overfilled', () => {
  const s=createInitialWorldState()
  const tavern=createBuilding(s.nextId++,'tavern',7,0,true)
  tavern.inventory.ale=13
  s.buildings.push(tavern); s.topology++
  assert.throws(()=>serializeWorld(s),/building resource capacity/)
})

test('Brewery converts 2 Food into 4 Ale per completed Day batch only', () => {
  const s=createInitialWorldState()
  const brewery=createBuilding(s.nextId++,'brewery',7,0,true)
  brewery.inventory.food=4
  s.buildings.push(brewery); s.topology++
  staffWorkplace(s,brewery)
  updateProduction(s,11,'day')
  assert.equal(brewery.inventory.food,4)
  assert.equal(brewery.inventory.ale,0)
  updateProduction(s,1,'day')
  assert.equal(brewery.inventory.food,2)
  assert.equal(brewery.inventory.ale,4)
  assert.equal(s.totals.productionConsumed.food,2)
  assert.equal(s.totals.produced.ale,4)
  updateProduction(s,24,'dusk')
  assert.equal(brewery.inventory.food,2)
  assert.equal(brewery.inventory.ale,4)
  validateWorld(s)
})

test('Brewery stops at Ale output capacity and resumes after Ale is removed', () => {
  const s=createInitialWorldState()
  const brewery=createBuilding(s.nextId++,'brewery',7,0,true)
  brewery.inventory.food=20
  brewery.inventory.ale=24
  s.buildings.push(brewery); s.topology++
  staffWorkplace(s,brewery)
  updateProduction(s,60,'day')
  assert.equal(brewery.inventory.food,20)
  assert.equal(brewery.inventory.ale,24)
  assert.equal(s.totals.produced.ale,0)
  brewery.inventory.ale=20
  updateProduction(s,12,'day')
  assert.equal(brewery.inventory.food,18)
  assert.equal(brewery.inventory.ale,24)
  assert.equal(s.totals.produced.ale,4)
  validateWorld(s)
})

test('mid-batch Brewery progress survives save load', () => {
  const s=createInitialWorldState()
  const brewery=createBuilding(s.nextId++,'brewery',7,0,true)
  brewery.inventory.food=4
  s.buildings.push(brewery); s.topology++
  staffWorkplace(s,brewery)
  updateProduction(s,7,'day')
  assert.equal(brewery.productionProgress,7)
  const loaded=deserializeWorld(serializeWorld(s))
  const loadedBrewery=loaded.buildings.find(b=>b.id===brewery.id)
  assert.equal(loadedBrewery.productionProgress,7)
  updateProduction(loaded,5,'day')
  assert.equal(loadedBrewery.inventory.food,2)
  assert.equal(loadedBrewery.inventory.ale,4)
  assert.equal(loadedBrewery.productionProgress,0)
  validateWorld(loaded)
})

test('Ale production and Tavern consumption preserve the production ledger', () => {
  const s=createInitialWorldState()
  const brewery=createBuilding(s.nextId++,'brewery',-7,0,true)
  const tavern=createBuilding(s.nextId++,'tavern',7,0,true)
  brewery.inventory.food=10
  s.buildings.push(brewery,tavern); s.topology++
  staffWorkplace(s,brewery)
  updateProduction(s,60,'day')
  assert.equal(s.totals.produced.ale,20)
  const transfer=Math.min(12,brewery.inventory.ale)
  brewery.inventory.ale-=transfer
  tavern.inventory.ale+=transfer
  const settler=s.settlers[0]
  const assignment=serviceAssignment(s,settler,'dusk')
  settler.x=assignment.target.x; settler.z=assignment.target.z
  updateServices(s,30,'dusk')
  assert.equal(s.totals.serviceConsumed.ale,2)
  assert.equal(aleBalance(s),0)
  validateWorld(s)
})

test('Tavern cannot operate from raw Food after the Ale migration', () => {
  const s=createInitialWorldState()
  const fire=createBuilding(s.nextId++,'campfire',-7,0,true)
  const tavern=createBuilding(s.nextId++,'tavern',7,0,true)
  tavern.inventory.food=0
  s.buildings.push(fire,tavern); s.topology++
  assert.equal(serviceAvailable(tavern),false)
  assert.ok([...serviceAssignments(s,'dusk').values()].every(a=>a.label==='Campfire'))
  validateWorld(s)
})

test('fresh settlements expose finite Iron Ore deposits but no gatherable Tools nodes', () => {
  const s=createInitialWorldState()
  const ore=s.nodes.filter(n=>n.resource==='ore')
  assert.equal(ore.length,12)
  assert.ok(ore.every(n=>n.remaining===30))
  assert.equal(s.nodes.some(n=>n.resource==='tools'),false)
  assert.deepEqual(s.targets,{wood:150,food:100,ale:0,ore:0,tools:0})
  validateWorld(s)
})

test('Blacksmith converts 3 Ore into 1 Tool per completed Day batch and respects output capacity', () => {
  const s=createInitialWorldState()
  const smith=createBuilding(s.nextId++,'blacksmith',7,0,true)
  smith.inventory.ore=18
  s.buildings.push(smith); s.topology++
  staffWorkplace(s,smith)
  updateProduction(s,17,'day')
  assert.equal(smith.inventory.ore,18)
  assert.equal(smith.inventory.tools,0)
  updateProduction(s,1,'day')
  assert.equal(smith.inventory.ore,15)
  assert.equal(smith.inventory.tools,1)
  assert.equal(s.totals.productionConsumed.ore,3)
  assert.equal(s.totals.produced.tools,1)
  updateProduction(s,90,'day')
  assert.equal(smith.inventory.ore,0)
  assert.equal(smith.inventory.tools,6)
  updateProduction(s,60,'day')
  assert.equal(smith.inventory.tools,6)
  updateProduction(s,60,'dusk')
  assert.equal(smith.inventory.tools,6)
  validateWorld(s)
})

test('workers route Ore into Blacksmith and Tools back through stockpile storage', () => {
  const s=createInitialWorldState()
  for(const settler of s.settlers) {
    settler.lastMealDay=s.day
    settler.needs={food:100,housing:100,safety:100,recreation:100}
  }
  const stockpile=s.buildings[0]
  stockpile.inventory.ore=18
  const smith=createBuilding(s.nextId++,'blacksmith',7,0,true)
  s.buildings.push(smith); s.topology++
  staffWorkplace(s,smith)
  const initialOre=accountedTotal(s,'ore')
  const sim=new Simulation(s)
  let sawOreSupply=false
  let sawToolsToStockpile=false
  for(let i=0;i<7000 && stockpile.inventory.tools<3;i++) {
    sim.step()
    for(const job of s.jobs) {
      if(job.kind!=='supply') continue
      if(job.sourceId===stockpile.id && job.targetId===smith.id && job.resource==='ore') sawOreSupply=true
      if(job.sourceId===smith.id && job.targetId===stockpile.id && job.resource==='tools') sawToolsToStockpile=true
    }
    if(i%200===0) validateWorld(s)
  }
  assert.equal(sawOreSupply,true)
  assert.equal(sawToolsToStockpile,true)
  assert.ok(stockpile.inventory.tools>=3)
  assert.ok(s.totals.productionConsumed.ore>=9)
  assert.ok(s.totals.produced.tools>=3)
  assert.equal(accountedTotal(s,'ore'),initialOre)
  assert.equal(toolsBalance(s),0)
  validateWorld(s)
})

test('Tool coverage is stockpile-backed, requires one Tool per two settlers and caps at +10%', () => {
  const s=createInitialWorldState()
  const smith=createBuilding(s.nextId++,'blacksmith',7,0,true)
  smith.inventory.tools=6
  s.buildings.push(smith); s.topology++
  let coverage=toolCoverage(s)
  assert.equal(SETTLERS_PER_TOOL,2)
  assert.equal(TOOL_WORK_BONUS_MAX,0.1)
  assert.equal(coverage.stored,0)
  assert.equal(coverage.required,3)
  assert.equal(coverage.workMultiplier,1)

  s.buildings[0].inventory.tools=2
  coverage=toolCoverage(s)
  assert.equal(coverage.stored,2)
  assert.ok(Math.abs(coverage.coverage-2/3)<1e-9)
  assert.ok(coverage.workMultiplier>1 && coverage.workMultiplier<1.1)

  s.buildings[0].inventory.tools=20
  coverage=toolCoverage(s)
  assert.equal(coverage.coverage,1)
  assert.equal(coverage.workMultiplier,1.1)
})

test('stockpiled Tools stack with Happiness for actual fixed-step work progress', () => {
  const s=createInitialWorldState()
  s.settlers=s.settlers.slice(0,1)
  const a=s.settlers[0]
  a.needs={food:100,housing:100,safety:100,recreation:100}
  a.lastMealDay=s.day
  s.buildings[0].inventory.tools=1
  const node=s.nodes.find(n=>n.resource==='food')
  a.x=node.x; a.z=node.z
  const job={
    id:s.nextId++,kind:'gather',settlerId:a.id,sourceId:node.id,targetId:s.buildings[0].id,
    resource:'food',amount:5,stage:'work',progress:0,
  }
  s.jobs=[job]; a.jobId=job.id
  const sim=new Simulation(s)
  sim.step()
  assert.ok(Math.abs(job.progress-0.05*1.15*1.1)<1e-9)
  validateWorld(s)
})

test('Blacksmith Ore, Tools and mid-batch progress survive current save load', () => {
  const s=createInitialWorldState()
  const smith=createBuilding(s.nextId++,'blacksmith',7,0,true)
  smith.inventory.ore=6
  smith.inventory.tools=2
  s.buildings.push(smith); s.topology++
  staffWorkplace(s,smith)
  updateProduction(s,7,'day')
  assert.equal(smith.productionProgress,7)
  const loaded=deserializeWorld(serializeWorld(s))
  const restored=loaded.buildings.find(b=>b.id===smith.id)
  assert.equal(restored.inventory.ore,6)
  assert.equal(restored.inventory.tools,2)
  assert.equal(restored.productionProgress,7)
  updateProduction(loaded,11,'day')
  assert.equal(restored.inventory.ore,3)
  assert.equal(restored.inventory.tools,3)
  assert.equal(loaded.totals.productionConsumed.ore,3)
  assert.equal(loaded.totals.produced.tools,1)
  validateWorld(loaded)
})

test('population attraction requires real spare housing, Food, Happiness and Safety', () => {
  const s=createInitialWorldState()
  let attraction=populationAttraction(s)
  assert.equal(attraction.eligible,false)
  assert.ok(attraction.blockers.includes('No spare bed'))

  makeAttractive(s)
  attraction=populationAttraction(s)
  assert.equal(attraction.eligible,true)
  assert.ok(attraction.score>=70)
  assert.equal(attraction.spareBeds,6)
  assert.equal(attraction.food,100)
  assert.equal(attraction.happiness,100)
  assert.equal(attraction.safety,100)
  validateWorld(s)
})

test('immigration needs two distinct qualifying Days and cannot double-count one Day', () => {
  const s=makeAttractive(createInitialWorldState())
  s.day=2
  let result=processImmigrationDay(s)
  assert.equal(result.arrived,false)
  assert.equal(s.immigration.eligibleDays,1)
  assert.equal(s.settlers.length,6)

  result=processImmigrationDay(s)
  assert.equal(result.arrived,false)
  assert.equal(s.immigration.eligibleDays,1)

  s.day=3
  result=processImmigrationDay(s)
  assert.equal(result.arrived,true)
  assert.equal(s.settlers.length,7)
  assert.equal(s.immigration.totalArrivals,1)
  assert.equal(s.immigration.eligibleDays,0)
  assert.equal(s.immigration.lastArrivalDay,3)
  assert.ok(s.settlers.at(-1).arrivalTarget)
  assert.ok(s.settlers.at(-1).homeId!==null)
  validateWorld(s)
})

test('Simulation Day transition performs the population-attraction check', () => {
  const s=makeAttractive(createInitialWorldState())
  s.day=2
  s.timeOfDay=5/24
  const sim=new Simulation(s)
  sim.setTimeOfDay(6/24)
  assert.equal(s.immigration.eligibleDays,1)
  assert.equal(s.settlers.length,6)

  sim.setTimeOfDay(5/24)
  s.day=3
  sim.setTimeOfDay(6/24)
  assert.equal(s.settlers.length,7)
  assert.equal(s.immigration.totalArrivals,1)
  validateWorld(s)
})

test('uncleared or active raids block immigration even when settlement needs are excellent', () => {
  const s=makeAttractive(createInitialWorldState())
  s.raid.wave=1
  s.raid.totalSpawned=20
  s.raid.totalDefeated=10
  s.raid.lastClearedWave=0
  let attraction=populationAttraction(s)
  assert.equal(attraction.eligible,false)
  assert.ok(attraction.blockers.includes('Latest raid not cleared'))

  const target=s.buildings[0]
  s.enemies=[{
    id:s.nextId++,kind:'raider',targetId:target.id,
    health:40,maxHealth:40,attackCooldown:0,lastHitTick:0,
    x:20,z:0,path:[],pathRevision:-1,status:'Test raider',
  }]
  attraction=populationAttraction(s)
  assert.equal(attraction.eligible,false)
  assert.ok(attraction.blockers.includes('Raid in progress'))
})

test('immigrant walks in from map edge and cannot take work until arrival completes', () => {
  const s=makeAttractive(createInitialWorldState())
  const result=forceImmigrationIfEligible(s)
  assert.equal(result.arrived,true)
  const immigrant=s.settlers.at(-1)
  assert.ok(Math.abs(immigrant.x)>=20 || Math.abs(immigrant.z)>=20)
  assert.ok(immigrant.arrivalTarget)
  assert.equal(immigrant.jobId,null)

  assignJobs(s)
  assert.equal(immigrant.jobId,null)

  const sim=new Simulation(s)
  let arrived=false
  for(let i=0;i<1200;i++) {
    sim.step()
    if(immigrant.arrivalTarget===null) { arrived=true; break }
  }
  assert.equal(arrived,true)
  assert.match(immigrant.status,/Arrived|Needs work|Gather|Travel|Supply/)
  assignJobs(s)
  assert.ok(immigrant.jobId!==null || immigrant.status!=='Arriving in Nightspire')
  assert.equal(sim.navigation.failures,0)
  validateWorld(s)
})

test('population cap blocks attraction and forced immigration', () => {
  const s=makeAttractive(createInitialWorldState())
  pop10(s)
  assignHousing(s)
  for(const settler of s.settlers) settler.needs={food:100,housing:100,safety:100,recreation:100}
  const attraction=populationAttraction(s)
  assert.equal(s.settlers.length,MAX_SETTLERS)
  assert.equal(attraction.eligible,false)
  assert.ok(attraction.blockers.includes('Population cap reached'))
  const result=forceImmigrationIfEligible(s)
  assert.equal(result.arrived,false)
  assert.equal(s.settlers.length,MAX_SETTLERS)
})

test('save load preserves a partially arrived immigrant and immigration cadence', () => {
  const s=makeAttractive(createInitialWorldState())
  s.day=4
  s.immigration.eligibleDays=1
  const result=forceImmigrationIfEligible(s)
  assert.equal(result.arrived,true)
  const immigrant=s.settlers.at(-1)
  const sim=new Simulation(s)
  for(let i=0;i<30;i++) sim.step()
  assert.ok(immigrant.arrivalTarget)

  const savedPosition={x:immigrant.x,z:immigrant.z}
  const loaded=deserializeWorld(serializeWorld(s))
  const loadedImmigrant=loaded.settlers.find(a=>a.id===immigrant.id)
  assert.deepEqual(loadedImmigrant.arrivalTarget,immigrant.arrivalTarget)
  assert.equal(loadedImmigrant.x,savedPosition.x)
  assert.equal(loadedImmigrant.z,savedPosition.z)
  assert.equal(loaded.immigration.totalArrivals,1)
  assert.equal(loaded.immigration.lastArrivalDay,4)

  const resumed=new Simulation(loaded)
  for(let i=0;i<1200 && loadedImmigrant.arrivalTarget;i++) resumed.step()
  assert.equal(loadedImmigrant.arrivalTarget,null)
  assert.equal(resumed.navigation.failures,0)
  validateWorld(loaded)
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
