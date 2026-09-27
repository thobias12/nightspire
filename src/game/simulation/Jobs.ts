import { BUILDINGS } from '../data/buildings'
import { CARRY_CAPACITY, JOBS, REPAIR_HP_PER_WOOD } from '../data/jobs'
import { RESOURCE_IDS, RESOURCES, type ResourceId } from '../data/resources'
import { available, freeStorage, needsRepair, readyToBuild, supplyFree, stockpiles } from './Buildings'
import { essentialJob, happinessEffect } from './Happiness'
import { JobReservations } from './JobReservations'
import { marketFoodNeed } from './Markets'
import { distance, entrance } from './Navigation'
import { activeWorkplace } from './Workforce'
import { compareStockpileDestinations, stockpileAccepts } from './StockpileLogistics'
import {
  primaryTradingPost, tradeExportStagingNeed, tradeFreeStorage, tradePostPickupAvailable,
} from './Trading'
import { workplaceHaulScore, workplaceInputNeed, workplaceOutputReady } from './WorkplaceLogistics'
import type { Building, Job, ResourceNode, Settler, WorldState } from './WorldState'

const repairSources = (state: WorldState): Building[] =>
  state.buildings.filter(b => b.complete && BUILDINGS[b.type].storage > 0 && b.inventory.wood > 0)

const repairWoodNeed = (state: WorldState, index: JobReservations): number => {
  const active = index.repairWood
  const missing = state.buildings
    .filter(needsRepair)
    .reduce((n, b) => n + Math.ceil((b.maxHealth - b.health) / REPAIR_HP_PER_WOOD), 0)
  return Math.max(0, missing - active)
}

function supplyNeed(state: WorldState, building: Building, resource: ResourceId, index: JobReservations): number {
  const production = BUILDINGS[building.type].production
  if (production?.inputResource === resource) return workplaceInputNeed(state, building, resource, index)
  if (BUILDINGS[building.type].foodDistribution?.resource === resource) return marketFoodNeed(state, building, index)
  return supplyFree(state, building, resource, index)
}

function gatherNeed(state: WorldState, resource: ResourceId, index: JobReservations): number {
  const stores = stockpiles(state)
  const availableStock = stores.reduce((n, b) => n + Math.max(0, available(state, b, resource, index)), 0)
  const inbound = index.gathered[resource]
  const construction = state.buildings.filter(b => !b.complete)
    .reduce((n, b) => n + Math.max(0, BUILDINGS[b.type].buildCost[resource] - b.delivered[resource] - index.delivered(b.id, resource)), 0)
  const repair = resource === 'wood' ? repairWoodNeed(state, index) : 0
  const supply = state.buildings
    .filter(b => b.complete && !b.destroyed)
    .reduce((sum, b) => sum + supplyNeed(state, b, resource, index), 0)
  return Math.max(0, state.targets[resource] + construction + repair + supply - availableStock - inbound)
}

// Reservations are derived from active jobs, so there is no second reservation ledger to drift.
export function assignJobs(state: WorldState): void {
  const index = new JobReservations(state.jobs)
  const stores = stockpiles(state)
  const repairs = state.buildings.filter(needsRepair)
  const repairInventory = repairSources(state)
  const operating = state.buildings.filter(b => b.complete && !b.destroyed)
  const producers = operating.filter(b => BUILDINGS[b.type].production)
  const sites = state.buildings.filter(b => !b.complete)

  for (const settler of state.settlers) {
    if (settler.jobId !== null || settler.health <= 0 || settler.arrivalTarget !== null) continue
    if (activeWorkplace(state, settler)) continue

    const options: Array<{ job: Omit<Job, 'id' | 'settlerId'>; score: number }> = []
    const morale = happinessEffect(settler)
    const offer = (
      option: Omit<Job, 'id' | 'settlerId'>,
      score = JOBS[option.kind].priority * 100,
    ): boolean => {
      if (morale.refusesNonessential && !essentialJob(option)) return false
      options.push({ job: option, score })
      return true
    }

    for (const building of repairs) {
      if (index.repairTargets.has(building.id)) continue
      const source = repairInventory
        .filter(store => available(state, store, 'wood', index) > 0 && store.id !== building.id)
        .sort((a, b) => distance(settler, a) - distance(settler, b))[0]
        ?? repairInventory
          .filter(store => available(state, store, 'wood', index) > 0)
          .sort((a, b) => distance(settler, a) - distance(settler, b))[0]

      if (!source) continue
      const missingWood = Math.ceil((building.maxHealth - building.health) / REPAIR_HP_PER_WOOD)
      offer({
        kind: 'repair',
        sourceId: source.id,
        targetId: building.id,
        resource: 'wood',
        amount: Math.min(CARRY_CAPACITY, missingWood, available(state, source, 'wood', index)),
        stage: 'source',
        progress: 0,
      })
    }

    const tradingPost = primaryTradingPost(state)
    if (tradingPost) {
      // Imported goods leave the post for ordinary accepting stockpiles.
      for (const resource of RESOURCE_IDS) {
        const amountAvailable = tradePostPickupAvailable(state, tradingPost, resource, index)
        if (amountAvailable <= 0) continue
        const store = stores
          .filter(candidate => stockpileAccepts(candidate, resource) && freeStorage(state, candidate, index) > 0)
          .sort((a, b) => compareStockpileDestinations(a, b, tradingPost))[0]
        if (!store) continue
        offer({
          kind: 'supply',
          sourceId: tradingPost.id,
          targetId: store.id,
          resource,
          amount: Math.min(CARRY_CAPACITY, amountAvailable, freeStorage(state, store, index)),
          stage: 'source',
          progress: 0,
        }, resource === 'food' ? 385 : 345)
      }

      // Exports are explicitly staged at the staffed post before the next caravan.
      if (!morale.refusesNonessential) {
        for (const resource of RESOURCE_IDS) {
          const needed = tradeExportStagingNeed(state, tradingPost, resource, index)
          if (needed <= 0) continue
          const source = stores
            .filter(candidate => available(state, candidate, resource, index) > 0)
            .sort((a, b) => distance(settler, a) - distance(settler, b))[0]
          if (!source) continue
          offer({
            kind: 'supply',
            sourceId: source.id,
            targetId: tradingPost.id,
            resource,
            amount: Math.min(
              CARRY_CAPACITY,
              needed,
              tradeFreeStorage(state, tradingPost, index),
              available(state, source, resource, index),
            ),
            stage: 'source',
            progress: 0,
          }, 325)
        }
      }
    }

    // Manufactured output always enters stockpile storage before downstream use.
    // This keeps the economy legible and gives stockpiles one authoritative inventory role.
    for (const source of producers) {
      const production = BUILDINGS[source.type].production!
      const resource = production.outputResource
      const amountAvailable = workplaceOutputReady(state, source, index)
      if (amountAvailable <= 0) continue

      const store = stores
        .filter(candidate => stockpileAccepts(candidate, resource) && freeStorage(state, candidate, index) > 0)
        .sort((a, b) => compareStockpileDestinations(a, b, source))[0]
      if (!store) continue

      offer({
        kind: 'supply',
        sourceId: source.id,
        targetId: store.id,
        resource,
        amount: Math.min(CARRY_CAPACITY, amountAvailable, freeStorage(state, store, index)),
        stage: 'source',
        progress: 0,
      }, workplaceHaulScore(source, source.inventory[resource] >= production.outputCapacity - production.outputAmount))
    }

    // Production inputs and service supplies are sourced from stockpiles only.
    for (const building of operating) {
      for (const resource of RESOURCE_IDS) {
        const needed = supplyNeed(state, building, resource, index)
        if (needed <= 0) continue

        const source = stores
          .filter(candidate => candidate.id !== building.id && available(state, candidate, resource, index) > 0)
          .sort((a, b) => distance(settler, a) - distance(settler, b))[0]
        if (!source) continue

        const production = BUILDINGS[building.type].production
        const distribution = BUILDINGS[building.type].foodDistribution
        const score = production?.inputResource === resource
          ? workplaceHaulScore(building, building.inventory[resource] < production.inputAmount)
          : distribution?.resource === resource
            ? 370
            : JOBS.supply.priority * 100
        offer({
          kind: 'supply',
          sourceId: source.id,
          targetId: building.id,
          resource,
          amount: Math.min(CARRY_CAPACITY, needed, available(state, source, resource, index)),
          stage: 'source',
          progress: 0,
        }, score)
      }
    }

    for (const b of sites) {
      for (const resource of RESOURCE_IDS) {
        const incoming = index.delivered(b.id, resource)
        const needed = BUILDINGS[b.type].buildCost[resource] - b.delivered[resource] - incoming
        if (needed <= 0) continue
        const source = stores
          .filter(p => available(state, p, resource, index) > 0)
          .sort((a, b) => distance(settler, a) - distance(settler, b))[0]
        if (source) {
          offer({
            kind: 'deliver',
            sourceId: source.id,
            targetId: b.id,
            resource,
            amount: Math.min(needed, CARRY_CAPACITY, available(state, source, resource, index)),
            stage: 'source',
            progress: 0,
          })
        }
      }
      if (readyToBuild(b) && !index.constructTargets.has(b.id)) {
        offer({
          kind: 'construct', sourceId: b.id, targetId: b.id,
          resource: 'wood', amount: 0, stage: 'source', progress: 0,
        })
      }
    }

    if (options.length === 0) {
      const needs: Record<ResourceId, number> = {
        wood: gatherNeed(state, 'wood', index),
        food: gatherNeed(state, 'food', index),
        ale: gatherNeed(state, 'ale', index),
        ore: gatherNeed(state, 'ore', index),
        tools: gatherNeed(state, 'tools', index),
      }
      // Only the first candidate is used. Preserve the original stable ordering on ties.
      let node: ResourceNode | undefined
      let nearest = Infinity
      for (const candidate of state.nodes) {
        if (morale.refusesNonessential && !essentialJob({ kind: 'gather', resource: candidate.resource })) continue
        if (candidate.remaining <= 0 || needs[candidate.resource] <= 0 || index.gatherSources.has(candidate.id)) continue
        const d = distance(settler, candidate)
        if (!node || needs[candidate.resource] > needs[node.resource]
          || (needs[candidate.resource] === needs[node.resource] && d < nearest)) {
          node = candidate; nearest = d
        }
      }
      if (node) {
        const store = stores
          .filter(b => stockpileAccepts(b, node.resource) && freeStorage(state, b, index) > 0)
          .sort((a, b) => compareStockpileDestinations(a, b, node))[0]
        if (store) offer({
          kind: 'gather',
          sourceId: node.id,
          targetId: store.id,
          resource: node.resource,
          amount: Math.min(node.remaining, RESOURCES[node.resource].batch, freeStorage(state, store, index), needs[node.resource]),
          stage: 'source',
          progress: 0,
        })
      }

      if (options.length === 0) {
        if (morale.refusesNonessential && needs.food <= 0) settler.status = morale.label + ' — essentials only'
        else if (stores.length > 0 && stores.every(b => freeStorage(state, b, index) <= 0)) settler.status = 'Storage full — build a stockpile'
        else if (RESOURCE_IDS.every(r => needs[r] <= 0)) settler.status = 'Stock targets met'
        else if (stores.length === 0) settler.status = 'No usable stockpile — repair storage'
        else settler.status = 'No resources left'
      }
    }

    options.sort((a, b) => b.score - a.score)
    const option = options[0]?.job
    if (!option) continue

    const job: Job = { ...option, id: state.nextId++, settlerId: settler.id }
    state.jobs.push(job)
    index.add(job)
    settler.jobId = job.id
    settler.path = []
    settler.pathRevision = -1
    settler.status = JOBS[job.kind].label
  }
}

export function jobDestination(state: WorldState, job: Job) {
  if (job.kind === 'gather' && job.stage !== 'target') return state.nodes.find(n => n.id === job.sourceId)!
  const id = job.stage === 'target' || job.stage === 'work' ? job.targetId : job.sourceId
  return entrance(state.buildings.find(b => b.id === id)!)
}

export function finishJob(state: WorldState, settler: Settler, job: Job): void {
  state.jobs.splice(state.jobs.indexOf(job), 1)
  settler.jobId = null
  settler.path = []
  settler.pathRevision = -1
  settler.status = 'Needs work'
}
