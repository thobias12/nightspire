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

test('M2.7 defeated attackers leave remains that laborers physically clear', () => {
  const s=createInitialWorldState()
  s.settlers=s.settlers.slice(0,1)
  s.nodes.forEach(node=>{node.remaining=0})
  s.targets={wood:0,food:0,ale:0,ore:0,tools:0}
  s.settlers[0].lastMealDay=s.day
  s.settlers[0].needs={food:100,housing:100,safety:100,recreation:100}

  const enemy={
    id:s.nextId++,kind:'raider',targetId:s.buildings[0].id,
    health:40,maxHealth:40,attackCooldown:0,lastHitTick:0,
    x:5,z:5,path:[],pathRevision:-1,status:'test',
  }
  s.enemies.push(enemy)
  s.raid.totalSpawned=1
  assert.equal(damageEnemy(s,enemy,999,'Test guard'),true)
  assert.equal(s.enemies.length,0)
  assert.equal(s.remains.length,1)
  assert.equal(s.remains[0].heavy,false)

  assignJobs(s)
  const cleanup=s.jobs.find(job=>job.kind==='cleanup')
  assert.ok(cleanup)
  assert.equal(cleanup.targetId,s.remains[0].id)

  const sim=new Simulation(s)
  advance(sim,8)
  assert.equal(s.remains.length,0)
  assert.ok(!s.jobs.some(job=>job.kind==='cleanup'))
  validateWorld(s)
})

test('M2.6 later raid waves include deterministic siege rams that prioritize fortifications', () => {
  const plan=raidPlanForWave(3)
  assert.ok(plan.rams>=1)
  const index=Array.from({length:plan.size},(_,i)=>i).find(i=>raidArchetypeForSpawn(3,i)==='ram')
  assert.ok(index!==undefined)

  const s=createInitialWorldState()
  const gate=createBuilding(s.nextId++,'wood-gate',0,8,true)
  const house=createBuilding(s.nextId++,'house',0,5,true)
  s.buildings.push(house,gate); s.topology++
  const ram={
    id:s.nextId++,kind:'raider',targetId:s.buildings[0].id,
    health:RAIDER_PROFILES.ram.maxHealth,maxHealth:RAIDER_PROFILES.ram.maxHealth,
    attackCooldown:0,lastHitTick:0,x:0,z:12,path:[],pathRevision:-1,status:'test',
  }
  assert.equal(raiderArchetype(ram),'ram')
  assert.equal(enemyTargetBuilding(s,ram).id,gate.id)
  assert.equal(RAIDER_PROFILES.ram.structureDamage,38)
})

test('M2.6 guards assigned to posts hold position and fire at range', () => {
  const s=createInitialWorldState()
  const post=createBuilding(s.nextId++,'guard-post',7,0,true)
  s.buildings.push(post); s.topology++
  const guard=s.settlers[0]
  guard.role='guard'
  const target=guardPostTarget(s,guard)
  assert.ok(target)
  guard.x=target.x; guard.z=target.z

  const enemy={
    id:s.nextId++,kind:'raider',targetId:s.buildings[0].id,
    health:40,maxHealth:40,attackCooldown:0,lastHitTick:0,
    x:post.x+Math.min(6,GUARD_RANGED_RANGE-1),z:post.z,path:[],pathRevision:-1,status:'test',
  }
  s.enemies.push(enemy)
  s.raid.lastSpawnDay=s.day
  s.raid.wave=1
  s.raid.totalSpawned=1

  const sim=new Simulation(s)
  sim.setTimeOfDay(21/24)
  const before=enemy.health
  advance(sim,2)
  assert.ok(enemy.health<=before-GUARD_RANGED_DAMAGE)
  assert.ok(Math.hypot(guard.x-target.x,guard.z-target.z)<0.1)
  assert.match(guard.status,/Guard Post|raider/i)
})

test('M3.13 settlement progression derives Camp through Stronghold from real settlement state', () => {
  const s=createInitialWorldState()
  assert.equal(settlementTier(s).id,'camp')

  const h1=createBuilding(s.nextId++,'house',-7,0,true)
  s.buildings.push(h1)
  assert.equal(settlementTier(s).id,'hamlet')

  const h2=createBuilding(s.nextId++,'house',7,0,true)
  const market=createBuilding(s.nextId++,'market',0,7,true)
  s.buildings.push(h2,market)
  s.roads.push({id:s.nextId++,points:[{x:-8,z:4},{x:8,z:4}],width:2})
  assert.equal(settlementTier(s).id,'village')

  h1.houseLevel=2
  s.buildings.push(
    createBuilding(s.nextId++,'blacksmith',-7,7,true),
    createBuilding(s.nextId++,'trading-post',7,7,true),
  )
  assert.equal(settlementTier(s).id,'town')

  h1.houseLevel=3
  s.buildings.push(createBuilding(s.nextId++,'guard-post',0,-7,true))
  for(let i=0;i<8;i++) s.buildings.push(createBuilding(s.nextId++,'wood-wall',-10+i,-10,true))
  s.raid.wave=2
  s.raid.lastClearedWave=2
  assert.equal(settlementTier(s).id,'stronghold')

  const metrics=settlementMetrics(s)
  assert.equal(metrics.prosperousHomes,1)
  assert.equal(metrics.fortifications,8)
  assert.equal(metrics.guardPosts,1)
  assert.ok(metrics.roadLength>=14)
})

test('M3.13 tier status explains the next concrete settlement requirements', () => {
  const s=createInitialWorldState()
  const status=settlementTierStatus(s)
  assert.equal(status.id,'camp')
  assert.equal(status.next.id,'hamlet')
  assert.ok(status.blockers.some(blocker=>blocker.includes('House')))
})

test('M3.12 housed residents form persistent named family records', () => {
  const s=createInitialWorldState()
  s.settlers=s.settlers.slice(0,2)
  const house=createBuilding(s.nextId++,'house',7,0,true)
  s.buildings.push(house); s.topology++
  assignHousing(s)
  const agents=s.settlers.length

  synchronizeFamilies(s)
  assert.equal(s.families.length,1)
  const family=s.families[0]
  assert.equal(family.adultIds.length,2)
  assert.equal(family.homeId,house.id)
  assert.equal(s.settlers.length,agents)
  const [a,b]=s.settlers
  assert.equal(a.partnerId,b.id)
  assert.equal(b.partnerId,a.id)
  assert.equal(a.familyId,family.id)
  assert.equal(b.familyId,family.id)
  assert.equal(a.familyName,family.surname)
  assert.equal(b.familyName,family.surname)
  assert.ok(a.givenName.length>0 && b.givenName.length>0)
  validateWorld(s)
})

test('M3.12 family identities and dependents survive save load', () => {
  const s=createInitialWorldState()
  s.settlers=s.settlers.slice(0,2)
  const house=createBuilding(s.nextId++,'house',7,0,true)
  s.buildings.push(house); s.topology++
  assignHousing(s)
  synchronizeFamilies(s)
  const family=s.families[0]
  if(family.children.length===0) family.children.push({givenName:'Mira',ageYears:8,ageDays:2})

  const loaded=deserializeWorld(serializeWorld(s))
  assert.deepEqual(loaded.families,s.families)
  assert.deepEqual(
    loaded.settlers.map(a=>[a.givenName,a.familyName,a.ageYears,a.familyId,a.partnerId]),
    s.settlers.map(a=>[a.givenName,a.familyName,a.ageYears,a.familyId,a.partnerId]),
  )
  assert.equal(familySummary(loaded).families,1)
  assert.ok(familySummary(loaded).children>=1)
  validateWorld(loaded)
})

test('M3.12 dependents consume housing headroom and prevent household overfill', () => {
  const s=createInitialWorldState()
  s.settlers=s.settlers.slice(0,2)
  const house=createBuilding(s.nextId++,'house',7,0,true)
  s.buildings.push(house); s.topology++
  assignHousing(s)
  synchronizeFamilies(s)
  const family=s.families[0]
  family.children=[
    {givenName:'Mira',ageYears:5,ageDays:0},
    {givenName:'Edric',ageYears:8,ageDays:0},
  ]

  assert.equal(dependentCount(s),2)
  assert.equal(dependentCountAtHome(s,house.id),2)
  assert.equal(settlementPopulation(s),4)
  assert.equal(populationAttraction(s).spareBeds,0)

  family.lastChildDay=1
  s.day=FAMILY_CHILD_INTERVAL_DAYS+1
  const result=processFamiliesDay(s)
  assert.equal(result.births,0)
  assert.equal(family.children.length,2)
  validateWorld(s)
})

test('M3.12 a dependent reaching working age replaces household dependency with a worker', () => {
  const s=createInitialWorldState()
  s.settlers=s.settlers.slice(0,2)
  const house=createBuilding(s.nextId++,'house',7,0,true)
  s.buildings.push(house); s.topology++
  assignHousing(s)
  synchronizeFamilies(s)
  const family=s.families[0]
  family.children=[{givenName:'Edric',ageYears:15,ageDays:CHILD_DAYS_PER_YEAR-1}]
  const beforePopulation=settlementPopulation(s)
  const beforeWorkers=s.settlers.length

  s.day++
  const result=processFamiliesDay(s)
  assert.equal(result.matured,1)
  assert.equal(s.settlers.length,beforeWorkers+1)
  assert.equal(settlementPopulation(s),beforePopulation)
  const adult=s.settlers.find(settler=>settler.givenName==='Edric')
  assert.ok(adult)
  assert.equal(adult.ageYears,16)
  assert.equal(adult.familyId,family.id)
  assert.equal(adult.homeId,house.id)
  validateWorld(s)
})

test('M3.12 dependents reserve real beds when housing new adults', () => {
  const s=createInitialWorldState()
  s.settlers=s.settlers.slice(0,3)
  const h1=createBuilding(s.nextId++,'house',-7,0,true)
  const h2=createBuilding(s.nextId++,'house',7,0,true)
  s.buildings.push(h1,h2); s.topology++
  s.settlers[0].homeId=h1.id
  s.settlers[1].homeId=h1.id
  s.settlers[2].homeId=null
  synchronizeFamilies(s)
  const family=s.families.find(f=>f.homeId===h1.id)
  assert.ok(family)
  family.children=[
    {givenName:'Mira',ageYears:4,ageDays:0},
    {givenName:'Edric',ageYears:7,ageDays:0},
  ]

  assignHousing(s)
  assert.equal(s.settlers[2].homeId,h2.id)
  assert.equal(
    s.settlers.filter(a=>a.homeId===h1.id).length + dependentCountAtHome(s,h1.id),
    4,
  )
  validateWorld(s)
})

test('M3.12 capped adolescents remain save-valid until a worker slot opens', () => {
  const s=createInitialWorldState()
  pop10(s)
  const houses=[
    createBuilding(s.nextId++,'house',-7,0,true),
    createBuilding(s.nextId++,'house',7,0,true),
    createBuilding(s.nextId++,'house',0,7,true),
  ]
  for(const house of houses) { house.houseLevel=3; s.buildings.push(house) }
  s.topology++
  assignHousing(s)
  synchronizeFamilies(s)
  const family=s.families.find(f=>f.homeId===houses[1].id)
  assert.ok(family)
  family.children=[{givenName:'Bryn',ageYears:15,ageDays:CHILD_DAYS_PER_YEAR-1}]
  const workers=s.settlers.length

  s.day++
  const result=processFamiliesDay(s)
  assert.equal(result.matured,0)
  assert.equal(s.settlers.length,workers)
  assert.equal(family.children[0].ageYears,15)
  assert.equal(family.children[0].ageDays,CHILD_DAYS_PER_YEAR-1)
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
