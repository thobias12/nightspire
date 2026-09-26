import { BUILDINGS } from '../data/buildings'
import { CARRY_CAPACITY, JOBS, REPAIR_HP_PER_WOOD } from '../data/jobs'
import { RESOURCE_IDS, RESOURCES, type ResourceId } from '../data/resources'
import { available, freeStorage, needsRepair, readyToBuild, supplyFree, stockpiles } from './Buildings'
import { essentialJob, happinessEffect } from './Happiness'
import { distance, entrance } from './Navigation'
import type { Building, Job, Settler, WorldState } from './WorldState'

const assignedToSite = (state: WorldState, buildingId: number, resource: ResourceId): number =>
  state.jobs
    .filter(j => j.kind === 'deliver' && j.targetId === buildingId && j.resource === resource)
    .reduce((n, j) => n + j.amount, 0)

const repairSources = (state: WorldState): Building[] =>
  state.buildings.filter(b => b.complete && BUILDINGS[b.type].storage > 0 && b.inventory.wood > 0)

const repairWoodNeed = (state: WorldState): number => {
  const active = state.jobs.filter(j => j.kind === 'repair').reduce((n, j) => n + j.amount, 0)
  const missing = state.buildings
    .filter(needsRepair)
    .reduce((n, b) => n + Math.ceil((b.maxHealth - b.health) / REPAIR_HP_PER_WOOD), 0)
  return Math.max(0, missing - active)
}

function gatherNeed(state: WorldState, resource: ResourceId): number {
  const stores = stockpiles(state)
  const availableStock = stores.reduce((n, b) => n + Math.max(0, available(state, b, resource)), 0)
  const inbound = state.jobs.filter(j => j.kind === 'gather' && j.resource === resource).reduce((n, j) => n + j.amount, 0)
  const construction = state.buildings.filter(b => !b.complete)
    .reduce((n, b) => n + Math.max(0, BUILDINGS[b.type].buildCost[resource] - b.delivered[resource] - assignedToSite(state, b.id, resource)), 0)
  const repair = resource === 'wood' ? repairWoodNeed(state) : 0
  const supply = state.buildings
    .filter(b => b.complete && !b.destroyed)
    .reduce((sum, b) => sum + supplyFree(state, b, resource), 0)
  return Math.max(0, state.targets[resource] + construction + repair + supply - availableStock - inbound)
}

// Reservations are derived from active jobs, so there is no second reservation ledger to drift.
export function assignJobs(state: WorldState): void {
  const stores = stockpiles(state)

  for (const settler of state.settlers) {
    if (settler.jobId !== null || settler.health <= 0 || settler.arrivalTarget !== null) continue

    const options: Omit<Job, 'id' | 'settlerId'>[] = []
    const morale = happinessEffect(settler)
    const offer = (option: Omit<Job, 'id' | 'settlerId'>): boolean => {
      if (morale.refusesNonessential && !essentialJob(option)) return false
      options.push(option)
      return true
    }

    for (const building of state.buildings.filter(needsRepair)) {
      if (state.jobs.some(j => j.kind === 'repair' && j.targetId === building.id)) continue
      const source = repairSources(state)
        .filter(store => available(state, store, 'wood') > 0 && store.id !== building.id)
        .sort((a, b) => distance(settler, a) - distance(settler, b))[0]
        ?? repairSources(state)
          .filter(store => available(state, store, 'wood') > 0)
          .sort((a, b) => distance(settler, a) - distance(settler, b))[0]

      if (!source) continue
      const missingWood = Math.ceil((building.maxHealth - building.health) / REPAIR_HP_PER_WOOD)
      offer({
        kind: 'repair',
        sourceId: source.id,
        targetId: building.id,
        resource: 'wood',
        amount: Math.min(CARRY_CAPACITY, missingWood, available(state, source, 'wood')),
        stage: 'source',
        progress: 0,
      })
    }

    // Manufactured output always enters stockpile storage before downstream use.
    // This keeps the economy legible and gives stockpiles one authoritative inventory role.
    for (const source of state.buildings.filter(b => b.complete && !b.destroyed && BUILDINGS[b.type].production)) {
      const production = BUILDINGS[source.type].production!
      const resource = production.outputResource
      const amountAvailable = available(state, source, resource)
      if (amountAvailable <= 0) continue

      const store = stores
        .filter(candidate => freeStorage(state, candidate) > 0)
        .sort((a, b) => distance(settler, a) - distance(settler, b))[0]
      if (!store) continue

      offer({
        kind: 'supply',
        sourceId: source.id,
        targetId: store.id,
        resource,
        amount: Math.min(CARRY_CAPACITY, amountAvailable, freeStorage(state, store)),
        stage: 'source',
        progress: 0,
      })
    }

    // Production inputs and service supplies are sourced from stockpiles only.
    for (const building of state.buildings.filter(b => b.complete && !b.destroyed)) {
      for (const resource of RESOURCE_IDS) {
        const needed = supplyFree(state, building, resource)
        if (needed <= 0) continue

        const source = stores
          .filter(candidate => candidate.id !== building.id && available(state, candidate, resource) > 0)
          .sort((a, b) => distance(settler, a) - distance(settler, b))[0]
        if (!source) continue

        offer({
          kind: 'supply',
          sourceId: source.id,
          targetId: building.id,
          resource,
          amount: Math.min(CARRY_CAPACITY, needed, available(state, source, resource)),
          stage: 'source',
          progress: 0,
        })
      }
    }

    for (const b of state.buildings.filter(b => !b.complete)) {
      for (const resource of RESOURCE_IDS) {
        const incoming = assignedToSite(state, b.id, resource)
        const needed = BUILDINGS[b.type].buildCost[resource] - b.delivered[resource] - incoming
        if (needed <= 0) continue
        const source = stores
          .filter(p => available(state, p, resource) > 0)
          .sort((a, b) => distance(settler, a) - distance(settler, b))[0]
        if (source) {
          offer({
            kind: 'deliver',
            sourceId: source.id,
            targetId: b.id,
            resource,
            amount: Math.min(needed, CARRY_CAPACITY, available(state, source, resource)),
            stage: 'source',
            progress: 0,
          })
        }
      }
      if (readyToBuild(b) && !state.jobs.some(j => j.kind === 'construct' && j.targetId === b.id)) {
        offer({
          kind: 'construct', sourceId: b.id, targetId: b.id,
          resource: 'wood', amount: 0, stage: 'source', progress: 0,
        })
      }
    }

    if (options.length === 0) {
      const needs: Record<ResourceId, number> = {
        wood: gatherNeed(state, 'wood'),
        food: gatherNeed(state, 'food'),
        ale: gatherNeed(state, 'ale'),
      }
      const nodes = state.nodes
        .filter(n => n.remaining > 0 && needs[n.resource] > 0 && !state.jobs.some(j => j.kind === 'gather' && j.sourceId === n.id))
        .sort((a, b) => needs[b.resource] - needs[a.resource] || distance(settler, a) - distance(settler, b))

      for (const node of nodes) {
        const store = stores
          .filter(b => freeStorage(state, b) > 0)
          .sort((a, b) => distance(node, a) - distance(node, b))[0]
        if (!store) break
        if (offer({
          kind: 'gather',
          sourceId: node.id,
          targetId: store.id,
          resource: node.resource,
          amount: Math.min(node.remaining, RESOURCES[node.resource].batch, freeStorage(state, store), needs[node.resource]),
          stage: 'source',
          progress: 0,
        })) break
      }

      if (options.length === 0) {
        if (morale.refusesNonessential && needs.food <= 0) settler.status = morale.label + ' — essentials only'
        else if (stores.length > 0 && stores.every(b => freeStorage(state, b) <= 0)) settler.status = 'Storage full — build a stockpile'
        else if (RESOURCE_IDS.every(r => needs[r] <= 0)) settler.status = 'Stock targets met'
        else if (stores.length === 0) settler.status = 'No usable stockpile — repair storage'
        else settler.status = 'No resources left'
      }
    }

    options.sort((a, b) => JOBS[b.kind].priority - JOBS[a.kind].priority)
    const option = options[0]
    if (!option) continue

    const job: Job = { ...option, id: state.nextId++, settlerId: settler.id }
    state.jobs.push(job)
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
