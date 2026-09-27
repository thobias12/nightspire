import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { createInitialWorldState, createBuilding, spawnSettler, DEFAULT_NEEDS, DEFAULT_TARGETS, MAX_SETTLERS } = require('../.test-build/game/simulation/WorldState.js')
const { Simulation } = require('../.test-build/game/simulation/Simulation.js')
const {
  assignHousing, cancelBuilding, demolishBuilding, placeBuilding, placeBuildingBatch,
  placementBatchError, placementError, stockpiles, available, freeStorage, wallLinePoints,
} = require('../.test-build/game/simulation/Buildings.js')
const { assignJobs } = require('../.test-build/game/simulation/Jobs.js')
const {
  canAdvanceConstruction, constructionCrewCapacity, constructionMaterialRatio,
  constructionStage, constructionWorkLimit, constructionWorkPoint,
} = require('../.test-build/game/simulation/Construction.js')
const { serializeWorld, deserializeWorld, validateWorld } = require('../.test-build/game/simulation/SaveLoad.js')
const { blockedCells, cellKey, entrance } = require('../.test-build/game/simulation/Navigation.js')
const { PATH_BUDGET } = require('../.test-build/game/data/jobs.js')
const { phaseForTime } = require('../.test-build/game/simulation/DayNight.js')
const { assignedGuardPost } = require('../.test-build/game/simulation/Schedule.js')
const {
  RAID_SIZE, RAID_MAX_SIZE, RAID_GROWTH, RAIDER_PROFILES, enemyTarget, enemyTargetBuilding,
  raidArchetypeForSpawn, raidFrontCountForWave, raidPlanForWave, raidSizeForWave, raiderArchetype,
} = require('../.test-build/game/simulation/Raid.js')
const { PLAYER_DAMAGE, PLAYER_ATTACK_RANGE, RAIDER_DAMAGE, damageBuilding } = require('../.test-build/game/simulation/Combat.js')
const { happinessOf, serveDailyMeal, settlementNeeds, updateNeeds } = require('../.test-build/game/simulation/Needs.js')
const { canAcceptJob, happinessEffect, settlementHappinessEffect, workRateFor } = require('../.test-build/game/simulation/Happiness.js')
const { SETTLERS_PER_TOOL, TOOL_WORK_BONUS_MAX, toolCoverage } = require('../.test-build/game/simulation/Tools.js')
const { IMMIGRATION_REQUIRED_DAYS, forceImmigrationIfEligible, populationAttraction, processImmigrationDay } = require('../.test-build/game/simulation/Population.js')
const { updateProduction } = require('../.test-build/game/simulation/Production.js')
const {
  assignWorkerToWorkplace, professionLabel, workplaceStaffing,
} = require('../.test-build/game/simulation/Workforce.js')
const {
  nextHaulPriority, workplaceHaulScore, workplaceInputNeed, workplaceInputTarget,
  workplaceOutputReady, workplaceOutputThreshold,
} = require('../.test-build/game/simulation/WorkplaceLogistics.js')
const {
  compareStockpileDestinations, nextStockpilePriority, stockpileAccepts,
} = require('../.test-build/game/simulation/StockpileLogistics.js')
const {
  completedMarkets, marketFoodNeed, marketFoodTarget, marketMealCapacity, marketMealsRemaining, marketSummary,
  MARKET_COVERAGE_RADIUS,
} = require('../.test-build/game/simulation/Markets.js')
const {
  householdStatus, householdSummary, RECREATION_COVERAGE_RADIUS,
} = require('../.test-build/game/simulation/Households.js')
const {
  houseBedCapacity, houseProgressionStatus, processHouseholdProgression,
} = require('../.test-build/game/simulation/HouseProgression.js')
const {
  MERCHANT_UNIT_LIMIT, TRADE_PRICES, adjustTradeReserve, merchantIntervalDays, merchantPresent,
  processMerchantTrade, scheduleMerchantVisit, tradeExportStagingNeed, tradeFreeStorage,
  tradeReputation,
} = require('../.test-build/game/simulation/Trading.js')
const {
  createField, fieldArea, fieldCentroid, fieldPlacementError, nearestFarmhouseForField, pointInPolygon,
} = require('../.test-build/game/simulation/FieldPlanning.js')
const {
  FIELD_GROWTH_DAYS, agricultureSummary, assignFieldsToFarmhouses, farmerFieldAssignment,
  fieldHarvestWork, fieldSowWork, processAgricultureDay, workField,
} = require('../.test-build/game/simulation/Agriculture.js')
const {
  serviceAssignment, serviceAssignments, serviceAvailable, serviceSummary, updateServices, SERVICE_COVERAGE_RADIUS,
} = require('../.test-build/game/simulation/Services.js')
const { atmosphereForTime, constructionVisualStage, damageVisualStage } = require('../.test-build/game/render/VisualState.js')
const { visualRoadStrip } = require('../.test-build/game/render/TownPresentation.js')
const { residentialPresentationProfile } = require('../.test-build/game/render/ResidentialPresentation.js')
const {
  backyardForPlot, buildingPlacementPreview, buildingRequiresRoadFrontage, buildingRoadPlacementError,
  insertRoadJunctionPoint, normalizeRoadPoints, residentialPlotBuildingError, residentialPlotError,
  residentialPlotPreview, residentialPlotResourceError, roadLength, roadPlacementError, sampleRoadCurve,
  snapPointToGrid, snapRoadControlPoint,
} = require('../.test-build/game/simulation/TownPlanning.js')
const advance = (sim, seconds) => {
  for (let i = 0; i < seconds * 20; i++) {
    sim.step()
    assert.ok(sim.navigation.solved <= PATH_BUDGET)
    if (i % 100 === 0) validateWorld(sim.state)
  }
}
const total = (s, r) => s.nodes.filter(n => n.resource === r).reduce((v,n) => v+n.remaining,0) +
  s.buildings.reduce((v,b) => v+b.inventory[r]+b.delivered[r],0) + s.settlers.reduce((v,a) => v+a.cargo[r],0)
const accountedTotal = (s, r) => total(s,r)
  + (r === 'wood' ? s.totals.repairWoodUsed : 0)
  + (r === 'food' ? s.totals.foodConsumed : 0)
  + s.totals.serviceConsumed[r]
  + s.totals.productionConsumed[r]
const aleBalance = s => total(s,'ale') + s.totals.serviceConsumed.ale - s.totals.produced.ale
const toolsBalance = s => total(s,'tools') - s.totals.produced.tools
const pop10 = s => { while(spawnSettler(s)) {} }
const makeAttractive = s => {
  const sites=[[-7,0],[7,0],[0,7]]
  for(const [x,z] of sites) {
    const house=createBuilding(s.nextId++,'house',x,z,true)
    s.buildings.push(house)
  }
  s.topology++
  s.buildings[0].inventory.food=100
  for(const settler of s.settlers) settler.needs={food:100,housing:100,safety:100,recreation:100}
  assignHousing(s)
  return s
}
const staffWorkplace = (s, building, count=2) => {
  const target=entrance(building)
  const workers=s.settlers.filter(a=>a.role==='worker' && a.workplaceId===null).slice(0,count)
  assert.equal(workers.length,count)
  for(const worker of workers) {
    worker.workplaceId=building.id
    worker.x=target.x; worker.z=target.z
    worker.path=[]; worker.pathRevision=-1
    worker.status='At workplace'
  }
  return workers
}
test('residential presentation keeps a 4x11 lot as a long burgage cottage instead of depth-upgrading it', () => {
  const plot={id:106,buildingId:107,roadId:1,frontageA:{x:0,z:0},frontageB:{x:4,z:0},depth:11,side:1,angle:0,backyard:'workyard'}
  const profile=residentialPresentationProfile(plot)
  assert.equal(profile.tier,'cottage')
  assert.equal(profile.form,'long-burgage')
  assert.equal(profile.label,'Long burgage cottage')
  assert.notEqual(profile.sidePassage,0)
  assert.equal(profile.roofFront,'gable')
  assert.equal(profile.frontageStyle,'hedge')
  assert.equal(profile.rearStructure,'workshop')
  assert.equal(profile.courtyard,'none')
  assert.ok(profile.houseWidth<=3.05)
})

test('residential presentation makes a 6x8 plot a balanced homestead', () => {
  const plot={id:110,buildingId:111,roadId:1,frontageA:{x:0,z:0},frontageB:{x:6,z:0},depth:8,side:1,angle:0,backyard:'garden'}
  const profile=residentialPresentationProfile(plot)
  assert.equal(profile.tier,'homestead')
  assert.equal(profile.form,'balanced')
  assert.equal(profile.label,'Homestead compound')
  assert.equal(profile.facadeWindows,2)
  assert.equal(profile.roofFront,'eave')
  assert.equal(profile.frontageStyle,'open')
  assert.equal(profile.rearStructure,'shed')
  assert.equal(profile.courtyard,'none')
})

test('residential presentation makes a wide shallow lot broad-front rather than oversized burgage', () => {
  const plot={id:114,buildingId:115,roadId:1,frontageA:{x:0,z:0},frontageB:{x:9,z:0},depth:6,side:1,angle:0,backyard:'firewood'}
  const profile=residentialPresentationProfile(plot)
  assert.equal(profile.tier,'homestead')
  assert.equal(profile.form,'wide-shallow')
  assert.equal(profile.label,'Broad-front homestead')
  assert.equal(profile.sidePassage,0)
  assert.equal(profile.facadeWindows,3)
  assert.equal(profile.roofFront,'eave')
  assert.equal(profile.frontageStyle,'gate')
  assert.equal(profile.rearStructure,'covered-storage')
  assert.equal(profile.courtyard,'none')
})

test('residential presentation breaks a 10x12 lot into a wide-deep burgage courtyard profile', () => {
  const plot={id:118,buildingId:119,roadId:1,frontageA:{x:0,z:0},frontageB:{x:10,z:0},depth:12,side:1,angle:0,backyard:'garden'}
  const profile=residentialPresentationProfile(plot)
  assert.equal(profile.tier,'burgage')
  assert.equal(profile.form,'wide-deep')
  assert.equal(profile.label,'Burgage courtyard compound')
  assert.notEqual(profile.sidePassage,0)
  assert.ok(profile.houseWidth<5)
  assert.equal(profile.facadeWindows,3)
  assert.equal(profile.roofFront,'eave')
  assert.equal(profile.frontageStyle,'short-fence')
  assert.equal(profile.rearStructure,'lean-to')
  assert.equal(profile.courtyard,'u')
})

test('road endpoints and centerline joins snap exactly and split the host road into a real junction node', () => {
  const roads=[{id:4,width:1.7,points:[{x:-6,z:0},{x:6,z:0}]}]
  assert.deepEqual(snapRoadControlPoint(roads,{x:6.8,z:0.7},{x:2,z:-4},true),{x:6,z:0})
  const center=snapRoadControlPoint(roads,{x:1.1,z:1.1},{x:1,z:-5},true)
  assert.deepEqual(center,{x:1,z:0})
  assert.equal(insertRoadJunctionPoint(roads,center),true)
  assert.deepEqual(roads[0].points,[{x:-6,z:0},{x:1,z:0},{x:6,z:0}])
  assert.equal(insertRoadJunctionPoint(roads,center),false)
})

test('adjacent residential plots snap flush to an existing frontage edge with Grid Snap on', () => {
  const roads=[{id:10,width:1.7,points:[{x:-10,z:0},{x:10,z:0}]}]
  const first=residentialPlotPreview(roads,{x:-5,z:0},{x:-1,z:-7},2.2,true,[])
  assert.ok(first)
  const existing=[{
    id:30,buildingId:31,roadId:first.roadId,
    frontageA:{...first.frontageA},frontageB:{...first.frontageB},
    depth:first.depth,side:first.side,angle:first.angle,backyard:'garden',
  }]
  const second=residentialPlotPreview(roads,{x:-0.35,z:0},{x:4.2,z:-7},2.2,true,existing)
  assert.ok(second)
  assert.equal(second.adjacentSnapped,true)
  assert.deepEqual(second.frontageA,first.frontageB)
  assert.equal(residentialPlotError(second,existing),null)
})

test('road-snapped service buildings sit closer to the street while preserving a valid grid center', () => {
  const roads=[{id:21,width:1.7,points:[{x:-10,z:0},{x:10,z:0}]}]
  const preview=buildingPlacementPreview(roads,{x:2.4,z:-2.2},'blacksmith',true,0)
  assert.equal(preview.snappedToRoad,true)
  assert.equal(Number.isInteger(preview.point.x),true)
  assert.equal(Number.isInteger(preview.point.z),true)
  assert.deepEqual(preview.point,{x:2,z:-3})
  assert.ok(Math.abs(preview.facingAngle)<1e-9)
})

test('Grid Snap rounds road controls independently while Shift angle constrain remains optional', () => {
  const roads=[]
  assert.deepEqual(snapPointToGrid({x:2.49,z:-3.51}),{x:2,z:-4})
  assert.deepEqual(snapRoadControlPoint(roads,{x:5.2,z:2.2},{x:0,z:0},true,false,false),{x:5,z:2})
  assert.deepEqual(snapRoadControlPoint(roads,{x:5.2,z:2.2},{x:0,z:0},true,true,false),{x:5,z:0})
  assert.deepEqual(snapRoadControlPoint(roads,{x:4.2,z:3.7},{x:0,z:0},true,true,false),{x:4,z:4})
  const constrained=snapRoadControlPoint(roads,{x:4.2,z:3.7},{x:0,z:0},false,true,false)
  assert.ok(Math.abs(constrained.x-constrained.z)<1e-9)
  assert.ok(Math.abs(Math.hypot(constrained.x,constrained.z)-Math.hypot(4.2,3.7))<1e-9)
  const free=snapRoadControlPoint(roads,{x:4.2,z:3.7},{x:0,z:0},false,false,false)
  assert.ok(Math.abs(free.x-4.2)<1e-9 && Math.abs(free.z-3.7)<1e-9)
})

test('Road Snap independently controls road endpoint and centerline magnetism', () => {
  const roads=[{id:31,width:1.7,points:[{x:-6,z:0},{x:6,z:0}]}]
  const manual=snapRoadControlPoint(roads,{x:2.4,z:0.5},{x:0,z:-4},false,false,false)
  assert.deepEqual(manual,{x:2.4,z:0.5})
  const center=snapRoadControlPoint(roads,{x:2.4,z:0.5},{x:0,z:-4},false,false,true)
  assert.ok(Math.abs(center.x-2.4)<1e-9 && Math.abs(center.z)<1e-9)
  const endpoint=snapRoadControlPoint(roads,{x:6.8,z:0.4},{x:0,z:-4},true,false,true)
  assert.deepEqual(endpoint,{x:6,z:0})
})

test('Grid Snap rounds residential frontage and depth while keeping the plot on the road edge', () => {
  const roads=[{id:10,width:2,points:[{x:-8,z:0},{x:8,z:0}]}]
  const free=residentialPlotPreview(roads,{x:-2.2,z:0.1},{x:3.35,z:-7.45},2.2,false)
  const snapped=residentialPlotPreview(roads,{x:-2.2,z:0.1},{x:3.35,z:-7.45},2.2,true)
  assert.ok(free && snapped)
  assert.notEqual(free.width,Math.round(free.width))
  assert.equal(snapped.width,6)
  assert.equal(snapped.depth,6)
  assert.ok(Math.abs(snapped.frontageA.z+1.12)<1e-9)
  assert.equal(snapped.housePoint.x,1)
  assert.ok(Number.isInteger(snapped.housePoint.z))
})

test('Road Snap magnetically positions and faces conventional buildings beside a nearby street', () => {
  const roads=[{id:21,width:1.7,points:[{x:-10,z:0},{x:10,z:0}]}]
  const snapped=buildingPlacementPreview(roads,{x:3.2,z:-2.4},'tavern',true,3)
  assert.equal(snapped.snappedToRoad,true)
  assert.equal(snapped.roadId,21)
  assert.deepEqual(snapped.point,{x:3,z:-3})
  assert.ok(Math.abs(snapped.facingAngle)<1e-9)
  assert.equal(snapped.rotation,0)

  const manual=buildingPlacementPreview(roads,{x:3.2,z:-2.4},'tavern',false,3)
  assert.equal(manual.snappedToRoad,false)
  assert.deepEqual(manual.point,{x:3,z:-2})
  assert.equal(manual.rotation,3)
  assert.equal(manual.facingAngle,null)
})

test('Road frontage snaps Campfires and conventional buildings but leaves fortifications manual', () => {
  const roads=[{id:21,width:1.7,points:[{x:-10,z:0},{x:10,z:0}]}]
  const campfire=buildingPlacementPreview(roads,{x:2.3,z:-1.1},'campfire',true,2)
  assert.equal(campfire.snappedToRoad,true)
  assert.equal(campfire.roadId,21)
  assert.equal(buildingRequiresRoadFrontage('campfire'),true)

  for(const type of ['wood-wall','wood-gate']) {
    const preview=buildingPlacementPreview(roads,{x:2.3,z:-1.1},type,true,2)
    assert.equal(preview.snappedToRoad,false)
    assert.deepEqual(preview.point,{x:2,z:-1})
    assert.equal(preview.rotation,2)
    assert.equal(buildingRequiresRoadFrontage(type),false)
  }
  assert.equal(buildingRequiresRoadFrontage('house'),false)
})

test('road-frontage validation rejects off-road conventional buildings and accepts snapped sites', () => {
  const roads=[{id:51,width:1.7,points:[{x:-10,z:0},{x:10,z:0}]}]
  const snapped=buildingPlacementPreview(roads,{x:3.1,z:-2.5},'farmhouse',true,0)
  assert.equal(snapped.snappedToRoad,true)
  assert.equal(buildingRoadPlacementError(roads,snapped.point,'farmhouse'),null)
  assert.match(buildingRoadPlacementError(roads,{x:3,z:-10},'farmhouse'),/road/i)
  assert.match(buildingRoadPlacementError([],{x:3,z:-3},'market'),/Build a road first/i)
  assert.equal(buildingRoadPlacementError([],{x:3,z:-3},'wood-wall'),null)
})

test('curved road sampling preserves endpoints and bends smoothly through control points', () => {
  const controls=[{x:0,z:0},{x:4,z:0},{x:7,z:4}]
  const points=sampleRoadCurve(controls,0.72,0.5)
  assert.deepEqual(points[0],controls[0])
  assert.deepEqual(points.at(-1),controls.at(-1))
  assert.ok(points.length>controls.length)
  assert.ok(points.some(p=>p.x>4 && p.x<7 && p.z>0 && p.z<4))
  assert.ok(roadLength(points)>Math.hypot(7,4))
  assert.equal(roadPlacementError(points),null)
})

test('straight road sampling keeps clicked control points as an aligned polyline', () => {
  const controls=[{x:0,z:0},{x:4,z:0},{x:4,z:5}]
  assert.deepEqual(sampleRoadCurve(controls,0),controls)
})

test('player road strokes normalize deterministically and require meaningful length', () => {
  const points=normalizeRoadPoints([
    {x:0,z:0},{x:0.1,z:0.1},{x:1,z:0.2},{x:2,z:0.5},{x:3,z:1},
  ])
  assert.deepEqual(points[0],{x:0,z:0})
  assert.deepEqual(points.at(-1),{x:3,z:1})
  assert.ok(points.length<5)
  assert.ok(roadLength(points)>3)
  assert.equal(roadPlacementError(points),null)
  assert.match(roadPlacementError([{x:0,z:0},{x:0.5,z:0}]),/2m/)
})

test('residential plot drag snaps frontage to a road and derives road-facing house orientation', () => {
  const roads=[{id:10,width:1.7,points:[{x:-8,z:0},{x:8,z:0}]}]
  const preview=residentialPlotPreview(roads,{x:-2,z:0.4},{x:3,z:-7})
  assert.ok(preview)
  assert.equal(preview.roadId,10)
  assert.ok(Math.abs(preview.width-5)<1e-9)
  assert.ok(Math.abs(preview.depth-6.03)<1e-9)
  assert.equal(preview.side,-1)
  assert.ok(Math.abs(preview.angle)<1e-9)
  assert.equal(preview.houseRotation,0)
  assert.equal(residentialPlotError(preview,[]),null)
  assert.equal(backyardForPlot(13,7),'chickens')
})

test('residential plots reject overlap, buildings and uncleared resources', () => {
  const roads=[{id:10,width:1.7,points:[{x:-8,z:0},{x:8,z:0}]}]
  const preview=residentialPlotPreview(roads,{x:-2,z:0},{x:3,z:-7})
  assert.ok(preview)
  const existing=[{
    id:11,buildingId:12,roadId:10,
    frontageA:{x:-1,z:0},frontageB:{x:4,z:0},depth:7,side:-1,angle:0,backyard:'garden',
  }]
  assert.match(residentialPlotError(preview,existing),/overlap/)
  assert.match(residentialPlotBuildingError(preview,[createBuilding(20,'stockpile',0,-3,true)]),/building/)
  assert.match(residentialPlotResourceError(preview,[{id:30,resource:'wood',remaining:10,x:0,z:-4}]),/Clear resources/)
})

test('player roads and residential plots survive save/load with their modular backyard identity', () => {
  const s=createInitialWorldState()
  const road={id:s.nextId++,width:2.4,points:sampleRoadCurve([{x:4,z:0},{x:7,z:1.2},{x:10,z:0}],0.72,0.5)}
  s.roads.push(road)
  const preview=residentialPlotPreview(s.roads,{x:7,z:1.2},{x:11,z:9})
  assert.ok(preview)
  const house=createBuilding(s.nextId++,'house',preview.housePoint.x,preview.housePoint.z,true,preview.houseRotation)
  s.buildings.push(house); s.topology++
  const plotId=s.nextId++
  s.residentialPlots.push({
    id:plotId,buildingId:house.id,roadId:road.id,
    frontageA:{...preview.frontageA},frontageB:{...preview.frontageB},depth:preview.depth,
    side:preview.side,angle:preview.angle,backyard:backyardForPlot(plotId,preview.depth),
  })
  validateWorld(s)
  house.facingAngle=Math.PI/4
  const loaded=deserializeWorld(serializeWorld(s))
  assert.deepEqual(loaded.roads,s.roads)
  assert.deepEqual(loaded.residentialPlots,s.residentialPlots)
  assert.equal(loaded.buildings.find(b=>b.id===house.id).facingAngle,Math.PI/4)
  validateWorld(loaded)
})

test('cancelling a plotted House blueprint removes the persistent residential plot', () => {
  const s=createInitialWorldState()
  const road={id:s.nextId++,width:1.7,points:[{x:4,z:0},{x:10,z:0}]}
  s.roads.push(road)
  const preview=residentialPlotPreview(s.roads,{x:4,z:0},{x:9,z:7})
  assert.ok(preview)
  const house=createBuilding(s.nextId++,'house',preview.housePoint.x,preview.housePoint.z,false,preview.houseRotation)
  s.buildings.push(house); s.topology++
  const plotId=s.nextId++
  s.residentialPlots.push({
    id:plotId,buildingId:house.id,roadId:road.id,
    frontageA:{...preview.frontageA},frontageB:{...preview.frontageB},depth:preview.depth,
    side:preview.side,angle:preview.angle,backyard:'garden',
  })
  assert.equal(cancelBuilding(s,house.id),null)
  assert.equal(s.residentialPlots.length,0)
  assert.equal(s.buildings.some(b=>b.id===house.id),false)
  validateWorld(s)
})

test('presentation road strip geometry remains deterministic for persisted road segments', () => {
  const link={fromId:1,toId:2,ax:0,az:0,bx:3,bz:4}
  const strip=visualRoadStrip(link)
  assert.equal(strip.x,1.5)
  assert.equal(strip.z,2)
  assert.equal(strip.length,5)
  assert.ok(Math.abs(strip.angle-Math.atan2(3,4))<1e-12)
  assert.deepEqual(link,{fromId:1,toId:2,ax:0,az:0,bx:3,bz:4})
})

test('visual atmosphere is bright by day, cold/dense at night and warmest near twilight', () => {
  const noon=atmosphereForTime(12/24)
  const midnight=atmosphereForTime(0)
  const dusk=atmosphereForTime(19/24)
  assert.ok(noon.daylight>0.9)
  assert.ok(midnight.night>0.9)
  assert.ok(noon.sunIntensity>midnight.sunIntensity)
  assert.ok(midnight.moonIntensity>noon.moonIntensity)
  assert.ok(midnight.moonIntensity>=1.4 && midnight.ambientIntensity>=0.7)
  assert.ok(midnight.fogNear<noon.fogNear && midnight.fogFar<noon.fogFar)
  assert.ok(midnight.fogFar>=118)
  assert.ok(dusk.twilight>0.95)
})

test('construction presentation advances through a full physical build sequence', () => {
  assert.equal(constructionVisualStage(0,10,false),'site')
  assert.equal(constructionVisualStage(1,10,false),'foundation')
  assert.equal(constructionVisualStage(3,10,false),'frame')
  assert.equal(constructionVisualStage(5,10,false),'scaffold')
  assert.equal(constructionVisualStage(7,10,false),'shell')
  assert.equal(constructionVisualStage(9,10,false),'finishing')
  assert.equal(constructionVisualStage(0,10,true),'complete')
})

test('construction work is capped by materials physically delivered to the site', () => {
  const s=createInitialWorldState()
  s.settlers=s.settlers.slice(0,1)
  s.nodes.forEach(node => { node.remaining=0 })
  s.buildings[0].inventory.wood=0
  s.targets={wood:0,food:0,ale:0,ore:0,tools:0}
  const site=createBuilding(s.nextId++,'house',7,0,false)
  site.delivered.wood=10
  s.buildings.push(site); s.topology++

  assert.equal(constructionMaterialRatio(site),0.5)
  assert.equal(constructionWorkLimit(site),6)
  assert.equal(canAdvanceConstruction(site),true)
  assert.equal(constructionStage(site),'site')

  const sim=new Simulation(s)
  advance(sim,12)
  assert.ok(Math.abs(site.work-6)<1e-8)
  assert.equal(site.complete,false)
  assert.equal(canAdvanceConstruction(site),false)
  assert.ok(!s.jobs.some(job=>job.kind==='construct' && job.targetId===site.id))
  validateWorld(s)
})

test('large construction sites use parallel builders while other settlers keep hauling', () => {
  const s=createInitialWorldState()
  s.nodes.forEach(node => { node.remaining=0 })
  s.targets={wood:0,food:0,ale:0,ore:0,tools:0}
  s.buildings[0].inventory.wood=10
  const site=createBuilding(s.nextId++,'house',7,0,false)
  site.delivered.wood=10
  s.buildings.push(site); s.topology++

  assert.equal(constructionCrewCapacity(site),2)
  assignJobs(s)
  const builders=s.jobs.filter(job=>job.kind==='construct' && job.targetId===site.id)
  const haulers=s.jobs.filter(job=>job.kind==='deliver' && job.targetId===site.id)
  assert.equal(builders.length,2)
  assert.equal(haulers.reduce((sum,job)=>sum+job.amount,0),10)
  assert.notDeepEqual(
    constructionWorkPoint(site,builders[0].settlerId),
    constructionWorkPoint(site,builders[1].settlerId),
  )
  validateWorld(s)
})

test('damage presentation maps health bands to readable world states', () => {
  assert.equal(damageVisualStage(100,100,false),'intact')
  assert.equal(damageVisualStage(70,100,false),'worn')
  assert.equal(damageVisualStage(40,100,false),'damaged')
  assert.equal(damageVisualStage(15,100,false),'critical')
  assert.equal(damageVisualStage(0,100,true),'ruin')
})

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
  for(const settler of s.settlers) settler.lastMealDay=s.day
  s.buildings[0].inventory={wood:300,food:100,ale:0,ore:0,tools:0}
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
test('wall drag snaps to one grid axis and places the whole valid line atomically', () => {
  const s=createInitialWorldState()
  const points=wallLinePoints({x:-8,z:8},{x:-4,z:10})
  assert.deepEqual(points,[
    {x:-8,z:8},{x:-7,z:8},{x:-6,z:8},{x:-5,z:8},{x:-4,z:8},
  ])
  assert.equal(placementBatchError(s,'wood-wall',points,1),null)
  const before=s.buildings.length
  assert.equal(placeBuildingBatch(s,'wood-wall',points,1),null)
  const walls=s.buildings.slice(before)
  assert.equal(walls.length,5)
  assert.ok(walls.every(b=>b.type==='wood-wall' && b.rotation===1 && !b.complete))
  validateWorld(s)
})

test('invalid wall drag rejects the entire line without partial blueprints', () => {
  const s=createInitialWorldState()
  const points=wallLinePoints({x:-3,z:0},{x:3,z:0})
  const before=s.buildings.length
  assert.match(placementBatchError(s,'wood-wall',points,1),/Overlaps/)
  assert.match(placeBuildingBatch(s,'wood-wall',points,1),/Overlaps/)
  assert.equal(s.buildings.length,before)
  validateWorld(s)
})

test('placing a gate on an existing wall converts it and retains the wall timber', () => {
  const s=createInitialWorldState()
  const wall=createBuilding(s.nextId++,'wood-wall',8,8,true)
  s.buildings.push(wall); s.topology++
  const before=s.buildings.length
  assert.equal(placeBuilding(s,'wood-gate',{x:8,z:8},1),null)
  assert.equal(s.buildings.length,before)
  assert.equal(wall.type,'wood-gate')
  assert.equal(wall.complete,false)
  assert.equal(wall.rotation,1)
  assert.equal(wall.delivered.wood,5)
  assert.equal(wall.work,0)
  assert.equal(wall.health,0)
  assert.equal(wall.maxHealth,220)
  validateWorld(s)
})

test('demolition removes an idle completed building and returns half its build materials', () => {
  const s=createInitialWorldState()
  const store=s.buildings[0]
  const house=createBuilding(s.nextId++,'house',8,8,true,2)
  s.buildings.push(house); s.topology++
  const woodBefore=store.inventory.wood
  assert.equal(demolishBuilding(s,house.id),null)
  assert.equal(s.buildings.some(b=>b.id===house.id),false)
  assert.equal(store.inventory.wood,woodBefore+10)
  assert.equal(s.topology,2)
  validateWorld(s)
})

test('building orientation survives save load and unsafe demolition is refused', () => {
  const s=createInitialWorldState()
  const brewery=createBuilding(s.nextId++,'brewery',8,8,true,3)
  brewery.inventory.food=1
  s.buildings.push(brewery); s.topology++
  assert.match(demolishBuilding(s,brewery.id),/Empty this building/)
  const loaded=deserializeWorld(serializeWorld(s))
  const restored=loaded.buildings.find(b=>b.id===brewery.id)
  assert.equal(restored.rotation,3)
  assert.equal(restored.inventory.food,1)
  validateWorld(loaded)
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
  s.buildings[0].inventory={wood:400,food:0,ale:0,ore:0,tools:0}
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
  s.targets={wood:25,food:0,ale:0,ore:0,tools:0}
  const sim=new Simulation(s)
  advance(sim,70)
  const stores=stockpiles(s)
  assert.equal(stores.reduce((n,b)=>n+b.inventory.wood,0),25)
  assert.equal(s.totals.gathered.wood,25)
  assert.equal(s.totals.gathered.food,0)
  assert.ok(s.settlers.every(a=>a.status==='Stock targets met'))

  const build=createInitialWorldState()
  build.targets={wood:0,food:0,ale:0,ore:0,tools:0}
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
  assert.equal(RAID_GROWTH,4)
  assert.equal(RAID_MAX_SIZE,40)
})

test('raid plans add deterministic skirmishers, brutes and a second attack front', () => {
  assert.deepEqual(raidPlanForWave(1),{
    wave:1,size:20,fronts:1,skirmishers:5,raiders:15,brutes:0,
  })
  assert.deepEqual(raidPlanForWave(2),{
    wave:2,size:24,fronts:2,skirmishers:5,raiders:16,brutes:3,
  })
  assert.equal(raidFrontCountForWave(1),1)
  assert.equal(raidFrontCountForWave(6),2)
  assert.equal(raidArchetypeForSpawn(1,3),'skirmisher')
  assert.equal(raidArchetypeForSpawn(2,5),'brute')
})

test('second-wave raid physically enters from opposite map fronts with encoded archetypes', () => {
  const s=createInitialWorldState()
  s.raid.wave=1
  s.day=2
  const sim=new Simulation(s)
  sim.setTimeOfDay(21/24)

  const plan=raidPlanForWave(2)
  assert.equal(s.enemies.length,plan.size)
  const edgeXs=new Set(s.enemies.filter(e=>Math.abs(e.x)>=21).map(e=>Math.sign(e.x)))
  assert.deepEqual([...edgeXs].sort(),[-1,1])
  const counts={skirmisher:0,raider:0,brute:0}
  for(const enemy of s.enemies) counts[raiderArchetype(enemy)]++
  assert.deepEqual(counts,{
    skirmisher:plan.skirmishers,
    raider:plan.raiders,
    brute:plan.brutes,
  })
  assert.ok(s.enemies.some(e=>e.maxHealth===RAIDER_PROFILES.brute.maxHealth))
  validateWorld(s)
})

test('raider archetypes pressure different settlement targets', () => {
  const s=createInitialWorldState()
  const guard=createBuilding(s.nextId++,'guard-post',0,7,true)
  const wall=createBuilding(s.nextId++,'wood-wall',0,9,true)
  s.buildings.push(guard,wall); s.topology++

  const skirmisher={
    id:s.nextId++,kind:'raider',targetId:s.buildings[0].id,
    health:28,maxHealth:28,attackCooldown:0,lastHitTick:0,
    x:0,z:11,path:[],pathRevision:-1,status:'test',
  }
  const brute={...skirmisher,id:s.nextId++,health:72,maxHealth:72}
  assert.equal(enemyTargetBuilding(s,skirmisher).id,guard.id)
  assert.equal(enemyTargetBuilding(s,brute).id,wall.id)
})

test('raiders actively break from structure pressure to engage nearby defenders', () => {
  const s=createInitialWorldState()
  const sim=new Simulation(s)
  sim.setTimeOfDay(21/24)
  const enemy=s.enemies[0]
  enemy.x=0; enemy.z=5; enemy.path=[]; enemy.pathRevision=-1
  s.player.x=4; s.player.z=5
  const beforeX=enemy.x
  for(let i=0;i<80;i++) sim.step()
  assert.ok(enemy.x>beforeX)
  assert.ok(enemy.status.includes('player') || s.player.health<s.player.maxHealth)
  validateWorld(s)
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

test('food shortage keeps unfed settlers due and feeds them when food arrives later', () => {
  const s=createInitialWorldState()
  s.buildings[0].inventory.food=2
  for(const a of s.settlers) { a.needs.food=60; a.lastMealDay=0 }
  assert.deepEqual(serveDailyMeal(s),{served:2,missed:4})
  assert.equal(s.buildings[0].inventory.food,0)
  assert.equal(s.totals.foodConsumed,2)
  assert.equal(s.settlers.filter(a=>a.needs.food===100).length,2)
  assert.equal(s.settlers.filter(a=>a.lastMealDay===0).length,4)
  assert.equal(s.settlers.filter(a=>a.needs.food===60).length,4)

  s.buildings[0].inventory.food=4
  assert.deepEqual(serveDailyMeal(s),{served:4,missed:0})
  assert.equal(s.totals.foodConsumed,6)
  assert.ok(s.settlers.every(a=>a.lastMealDay===s.day))
  validateWorld(s)
})

test('one campfire serves six workers and restores recreation during off-hours', () => {
  const s=createInitialWorldState(); pop10(s)
  const fire=createBuilding(s.nextId++,'campfire',7,0,true)
  s.buildings.push(fire); s.topology++
  const assigned=s.settlers.filter(a=>serviceAssignment(s,a,'dusk')!==null)
  assert.equal(assigned.length,6)
  const settler=assigned[0], assignment=serviceAssignment(s,settler,'dusk')
  settler.x=assignment.target.x; settler.z=assignment.target.z
  settler.needs.recreation=20
  updateServices(s,5,'dusk')
  assert.ok(settler.needs.recreation>=40)
  assert.equal(serviceAssignment(s,s.settlers[9],'dusk'),null)
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

test('happiness consequences map needs to readable productivity bands', () => {
  const s=createInitialWorldState()
  const a=s.settlers[0]

  a.needs={food:100,housing:100,safety:100,recreation:100}
  assert.deepEqual(
    { band:happinessEffect(a).band, rate:happinessEffect(a).workRate, refusing:happinessEffect(a).refusesNonessential },
    { band:'thriving', rate:1.15, refusing:false },
  )

  a.needs={food:70,housing:70,safety:70,recreation:70}
  assert.equal(happinessEffect(a).band,'content')
  assert.equal(happinessEffect(a).workRate,1)

  a.needs={food:50,housing:50,safety:50,recreation:50}
  assert.equal(happinessEffect(a).band,'strained')
  assert.equal(happinessEffect(a).workRate,0.9)

  a.needs={food:30,housing:30,safety:30,recreation:30}
  assert.equal(happinessEffect(a).band,'unhappy')
  assert.equal(happinessEffect(a).workRate,0.75)

  a.needs={food:10,housing:10,safety:10,recreation:10}
  assert.equal(happinessEffect(a).band,'miserable')
  assert.equal(happinessEffect(a).workRate,0.6)
  assert.equal(happinessEffect(a).refusesNonessential,true)
})

test('severe hunger restricts nonessential work even before average Happiness collapses', () => {
  const s=createInitialWorldState()
  const a=s.settlers[0]
  a.needs={food:10,housing:100,safety:100,recreation:100}
  const effect=happinessEffect(a)
  assert.ok(effect.happiness>65)
  assert.equal(effect.reason,'Severe hunger')
  assert.equal(effect.workRate,0.6)
  assert.equal(effect.refusesNonessential,true)

  assert.equal(canAcceptJob(a,{kind:'gather',resource:'wood'}),false)
  assert.equal(canAcceptJob(a,{kind:'construct',resource:'wood'}),false)
  assert.equal(canAcceptJob(a,{kind:'gather',resource:'food'}),true)
  assert.equal(canAcceptJob(a,{kind:'repair',resource:'wood'}),true)
  assert.equal(workRateFor(a,{kind:'gather',resource:'wood'}),0)
  assert.equal(workRateFor(a,{kind:'gather',resource:'food'}),0.6)
})

test('miserable workers choose survival gathering instead of routine wood work', () => {
  const s=createInitialWorldState()
  s.settlers=s.settlers.slice(0,1)
  const a=s.settlers[0]
  a.needs={food:10,housing:10,safety:10,recreation:10}
  a.lastMealDay=s.day
  assignJobs(s)
  const job=s.jobs.find(j=>j.settlerId===a.id)
  assert.ok(job)
  assert.equal(job.kind,'gather')
  assert.equal(job.resource,'food')
})

test('active work progress uses the settler happiness productivity rate', () => {
  const setup = needs => {
    const s=createInitialWorldState()
    s.settlers=s.settlers.slice(0,1)
    const a=s.settlers[0]
    const node=s.nodes.find(n=>n.resource==='food')
    a.needs={...needs}
    a.lastMealDay=s.day
    a.x=node.x; a.z=node.z
    const job={
      id:s.nextId++,kind:'gather',settlerId:a.id,sourceId:node.id,targetId:s.buildings[0].id,
      resource:'food',amount:5,stage:'work',progress:0,
    }
    s.jobs=[job]; a.jobId=job.id
    return {s,a,job,sim:new Simulation(s)}
  }

  const thriving=setup({food:100,housing:100,safety:100,recreation:100})
  thriving.sim.step()
  assert.ok(Math.abs(thriving.job.progress-0.05*1.15)<1e-9)

  const unhappy=setup({food:30,housing:30,safety:30,recreation:30})
  unhappy.sim.step()
  assert.ok(Math.abs(unhappy.job.progress-0.05*0.75)<1e-9)

  const summary=settlementHappinessEffect(unhappy.s)
  assert.equal(summary.bands.unhappy,1)
  assert.ok(summary.averageWorkRate<1)
})

test('existing nonessential jobs are released when misery becomes severe', () => {
  const s=createInitialWorldState()
  s.settlers=s.settlers.slice(0,1)
  const a=s.settlers[0]
  a.needs={food:10,housing:10,safety:10,recreation:10}
  a.lastMealDay=s.day
  const site=createBuilding(s.nextId++,'house',7,0,false)
  site.delivered.wood=20
  s.buildings.push(site)
  const job={
    id:s.nextId++,kind:'construct',settlerId:a.id,sourceId:site.id,targetId:site.id,
    resource:'wood',amount:0,stage:'work',progress:0,
  }
  s.jobs=[job]; a.jobId=job.id; a.x=site.x; a.z=site.z
  const sim=new Simulation(s)
  sim.step()
  assert.equal(site.work,0)
  assert.equal(a.jobId,null)
  assert.equal(s.jobs.length,0)
  assert.match(a.status,/essentials only/)
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

test('new game settlers eat on day one as soon as food reaches storage', () => {
  const s=createInitialWorldState()
  const sim=new Simulation(s)
  assert.ok(s.settlers.every(a=>a.lastMealDay===0))
  for(let i=0;i<12;i++) sim.step()
  assert.equal(s.totals.foodConsumed,0)

  s.buildings[0].inventory.food=6
  for(let i=0;i<12;i++) sim.step()
  assert.equal(s.totals.foodConsumed,6)
  assert.equal(s.buildings[0].inventory.food,0)
  assert.ok(s.settlers.every(a=>a.lastMealDay===1))

  s.buildings[0].inventory.food=6
  for(let i=0;i<20;i++) sim.step()
  assert.equal(s.totals.foodConsumed,6)
  assert.equal(s.buildings[0].inventory.food,6)
  validateWorld(s)
})

test('legacy M2.4 saves migrate settler needs and food accounting', () => {
  const s=createInitialWorldState()
  const legacy=JSON.parse(serializeWorld(s))
  for(const a of legacy.settlers) { delete a.needs; delete a.lastMealDay }
  delete legacy.totals.foodConsumed
  const loaded=deserializeWorld(JSON.stringify(legacy))
  assert.ok(loaded.settlers.every(a=>JSON.stringify(a.needs)===JSON.stringify(DEFAULT_NEEDS)))
  assert.ok(loaded.settlers.every(a=>a.lastMealDay===Math.max(0,loaded.day-1)))
  assert.equal(loaded.totals.foodConsumed,0)
  validateWorld(loaded)
})

test('M3.0 saves with zero lifetime meals are corrected as still due', () => {
  const s=createInitialWorldState()
  for(const a of s.settlers) a.lastMealDay=s.day
  s.totals.foodConsumed=0
  const loaded=deserializeWorld(serializeWorld(s))
  assert.ok(loaded.settlers.every(a=>a.lastMealDay===Math.max(0,loaded.day-1)))
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
