import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { createInitialWorldState, createBuilding, spawnSettler, DEFAULT_NEEDS, DEFAULT_TARGETS, MAX_SETTLERS } = require('../../.test-build/game/model/WorldState.js')
const { Simulation } = require('../../.test-build/game/runtime/Simulation.js')
const {
  assignHousing, cancelBuilding, demolishBuilding, placeBuilding, placeBuildingBatch,
  placementBatchError, placementError, stockpiles, available, freeStorage, wallLinePoints,
} = require('../../.test-build/game/systems/construction/Buildings.js')
const { assignJobs } = require('../../.test-build/game/systems/jobs/Jobs.js')
const { serializeWorld, deserializeWorld, validateWorld } = require('../../.test-build/game/persistence/SaveLoad.js')
const { blockedCells, cellKey, entrance } = require('../../.test-build/game/world/Navigation.js')
const { PATH_BUDGET } = require('../../.test-build/game/data/jobs.js')
const { phaseForTime } = require('../../.test-build/game/runtime/DayNight.js')
const { assignedGuardPost } = require('../../.test-build/game/systems/population/Schedule.js')
const { RAID_SIZE, RAID_MAX_SIZE, raidSizeForWave, enemyTarget, enemyTargetBuilding } = require('../../.test-build/game/systems/combat/Raid.js')
const { PLAYER_DAMAGE, PLAYER_ATTACK_RANGE, RAIDER_DAMAGE, damageBuilding } = require('../../.test-build/game/systems/combat/Combat.js')
const { happinessOf, serveDailyMeal, settlementNeeds, updateNeeds } = require('../../.test-build/game/systems/population/Needs.js')
const { canAcceptJob, happinessEffect, settlementHappinessEffect, workRateFor } = require('../../.test-build/game/systems/population/Happiness.js')
const { SETTLERS_PER_TOOL, TOOL_WORK_BONUS_MAX, toolCoverage } = require('../../.test-build/game/systems/economy/Tools.js')
const { IMMIGRATION_REQUIRED_DAYS, forceImmigrationIfEligible, populationAttraction, processImmigrationDay } = require('../../.test-build/game/systems/population/Population.js')
const { updateProduction } = require('../../.test-build/game/systems/economy/Production.js')
const {
  FORESTER_TREE_TARGET, SAPLING_GROWTH_PER_DAY, processForestryDay, updateResourceWorkplaces,
} = require('../../.test-build/game/systems/economy/ResourceWorkplaces.js')
const {
  assignWorkerToWorkplace, professionLabel, workplaceStaffing,
} = require('../../.test-build/game/systems/population/Workforce.js')
const {
  nextHaulPriority, workplaceHaulScore, workplaceInputNeed, workplaceInputTarget,
  workplaceOutputReady, workplaceOutputThreshold,
} = require('../../.test-build/game/systems/economy/WorkplaceLogistics.js')
const {
  compareStockpileDestinations, nextStockpilePriority, stockpileAccepts,
} = require('../../.test-build/game/systems/economy/StockpileLogistics.js')
const {
  completedMarkets, marketFoodNeed, marketFoodTarget, marketMealCapacity, marketMealsRemaining, marketSummary,
  MARKET_COVERAGE_RADIUS,
} = require('../../.test-build/game/systems/economy/Markets.js')
const {
  householdStatus, householdSummary, RECREATION_COVERAGE_RADIUS,
} = require('../../.test-build/game/systems/population/Households.js')
const {
  houseBedCapacity, houseProgressionStatus, processHouseholdProgression,
} = require('../../.test-build/game/systems/population/HouseProgression.js')
const {
  MERCHANT_UNIT_LIMIT, TRADE_PRICES, adjustTradeReserve, merchantIntervalDays, merchantPresent,
  processMerchantTrade, scheduleMerchantVisit, tradeExportStagingNeed, tradeFreeStorage,
  tradeReputation,
} = require('../../.test-build/game/systems/economy/Trading.js')
const {
  createField, fieldArea, fieldCentroid, fieldPlacementError, nearestFarmhouseForField, pointInPolygon,
} = require('../../.test-build/game/world/FieldPlanning.js')
const {
  FIELD_GROWTH_DAYS, agricultureSummary, assignFieldsToFarmhouses, farmerFieldAssignment,
  fieldHarvestWork, fieldSowWork, processAgricultureDay, workField,
} = require('../../.test-build/game/systems/economy/Agriculture.js')
const {
  serviceAssignment, serviceAssignments, serviceAvailable, serviceSummary, updateServices, SERVICE_COVERAGE_RADIUS,
} = require('../../.test-build/game/systems/population/Services.js')
const { atmosphereForTime, constructionVisualStage, damageVisualStage } = require('../../.test-build/game/render/VisualState.js')
const { visualRoadStrip } = require('../../.test-build/game/render/TownPresentation.js')
const { residentialPresentationProfile } = require('../../.test-build/game/render/ResidentialPresentation.js')
const {
  backyardForPlot, buildingPlacementPreview, buildingRequiresRoadFrontage, buildingRoadPlacementError,
  insertRoadJunctionPoint, normalizeRoadPoints, residentialPlotBuildingError, residentialPlotError,
  residentialPlotPreview, residentialPlotResourceError, roadLength, roadPlacementError, sampleRoadCurve,
  snapPointToGrid, snapRoadControlPoint,
} = require('../../.test-build/game/world/TownPlanning.js')
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

export { DEFAULT_NEEDS, DEFAULT_TARGETS, FIELD_GROWTH_DAYS, FORESTER_TREE_TARGET, IMMIGRATION_REQUIRED_DAYS, MARKET_COVERAGE_RADIUS, MAX_SETTLERS, MERCHANT_UNIT_LIMIT, PATH_BUDGET, PLAYER_ATTACK_RANGE, PLAYER_DAMAGE, RAIDER_DAMAGE, RAID_MAX_SIZE, RAID_SIZE, RECREATION_COVERAGE_RADIUS, SAPLING_GROWTH_PER_DAY, SERVICE_COVERAGE_RADIUS, SETTLERS_PER_TOOL, Simulation, TOOL_WORK_BONUS_MAX, TRADE_PRICES, accountedTotal, adjustTradeReserve, advance, agricultureSummary, aleBalance, assert, assignFieldsToFarmhouses, assignHousing, assignJobs, assignWorkerToWorkplace, assignedGuardPost, atmosphereForTime, available, backyardForPlot, blockedCells, buildingPlacementPreview, buildingRequiresRoadFrontage, buildingRoadPlacementError, canAcceptJob, cancelBuilding, cellKey, compareStockpileDestinations, completedMarkets, constructionVisualStage, createBuilding, createField, createInitialWorldState, damageBuilding, damageVisualStage, demolishBuilding, deserializeWorld, enemyTarget, enemyTargetBuilding, entrance, farmerFieldAssignment, fieldArea, fieldCentroid, fieldHarvestWork, fieldPlacementError, fieldSowWork, forceImmigrationIfEligible, freeStorage, happinessEffect, happinessOf, houseBedCapacity, houseProgressionStatus, householdStatus, householdSummary, insertRoadJunctionPoint, makeAttractive, marketFoodNeed, marketFoodTarget, marketMealCapacity, marketMealsRemaining, marketSummary, merchantIntervalDays, merchantPresent, nearestFarmhouseForField, nextHaulPriority, nextStockpilePriority, normalizeRoadPoints, phaseForTime, placeBuilding, placeBuildingBatch, placementBatchError, placementError, pointInPolygon, pop10, populationAttraction, processAgricultureDay, processForestryDay, processHouseholdProgression, processImmigrationDay, processMerchantTrade, professionLabel, raidSizeForWave, require, residentialPlotBuildingError, residentialPlotError, residentialPlotPreview, residentialPlotResourceError, residentialPresentationProfile, roadLength, roadPlacementError, sampleRoadCurve, scheduleMerchantVisit, serializeWorld, serveDailyMeal, serviceAssignment, serviceAssignments, serviceAvailable, serviceSummary, settlementHappinessEffect, settlementNeeds, snapPointToGrid, snapRoadControlPoint, spawnSettler, staffWorkplace, stockpileAccepts, stockpiles, test, toolCoverage, toolsBalance, total, tradeExportStagingNeed, tradeFreeStorage, tradeReputation, updateNeeds, updateProduction, updateResourceWorkplaces, updateServices, validateWorld, visualRoadStrip, wallLinePoints, workField, workRateFor, workplaceHaulScore, workplaceInputNeed, workplaceInputTarget, workplaceOutputReady, workplaceOutputThreshold, workplaceStaffing }
