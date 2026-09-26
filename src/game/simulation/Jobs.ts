import { BUILDINGS } from '../data/buildings'
import { CARRY_CAPACITY, JOBS } from '../data/jobs'
import { RESOURCE_IDS, RESOURCES } from '../data/resources'
import { available, freeStorage, readyToBuild, stockpiles } from './Buildings'
import { distance, entrance } from './Navigation'
import type { Job, Settler, WorldState } from './WorldState'

// Reservations are derived from active jobs, so there is no second reservation ledger to drift.
export function assignJobs(state: WorldState): void {
  const stores = stockpiles(state)
  for (const settler of state.settlers) {
    if (settler.jobId !== null) continue
    const options: Omit<Job, 'id' | 'settlerId'>[] = []
    for (const b of state.buildings.filter(b => !b.complete)) {
      for (const resource of RESOURCE_IDS) {
        const incoming = state.jobs.filter(j => j.kind === 'deliver' && j.targetId === b.id && j.resource === resource).reduce((n, j) => n + j.amount, 0)
        const needed = BUILDINGS[b.type].buildCost[resource] - b.delivered[resource] - incoming
        if (needed <= 0) continue
        const source = stores.filter(p => available(state, p, resource) > 0).sort((a, b) => distance(settler, a) - distance(settler, b))[0]
        if (source) options.push({ kind: 'deliver', sourceId: source.id, targetId: b.id, resource,
          amount: Math.min(needed, CARRY_CAPACITY, available(state, source, resource)), stage: 'source', progress: 0 })
      }
      if (readyToBuild(b) && !state.jobs.some(j => j.kind === 'construct' && j.targetId === b.id))
        options.push({ kind: 'construct', sourceId: b.id, targetId: b.id, resource: 'wood', amount: 0, stage: 'source', progress: 0 })
    }
    if (options.length === 0) {
      // Balance food and wood; construction demand gives wood priority.
      const counts = (r: 'wood' | 'food') => stores.reduce((n, b) => n + b.inventory[r], 0) +
        state.jobs.filter(j => j.kind === 'gather' && j.resource === r).reduce((n, j) => n + j.amount, 0)
      const demand = state.buildings.some(b => !b.complete && !readyToBuild(b))
      const preferred = demand || counts('wood') < counts('food') * 2 + 20 ? 'wood' : 'food'
      const nodes = state.nodes.filter(n => n.remaining > 0 && !state.jobs.some(j => j.kind === 'gather' && j.sourceId === n.id))
        .sort((a, b) => Number(b.resource === preferred) - Number(a.resource === preferred) || distance(settler, a) - distance(settler, b))
      for (const node of nodes) {
        const store = stores.filter(b => freeStorage(state, b) > 0).sort((a, b) => distance(node, a) - distance(node, b))[0]
        if (!store) break
        options.push({ kind: 'gather', sourceId: node.id, targetId: store.id, resource: node.resource,
          amount: Math.min(node.remaining, RESOURCES[node.resource].batch, freeStorage(state, store)), stage: 'source', progress: 0 })
        break
      }
    }
    options.sort((a, b) => JOBS[b.kind].priority - JOBS[a.kind].priority)
    const option = options[0]
    if (!option) {
      settler.status = stores.every(b => freeStorage(state, b) <= 0) ? 'Storage full — build a stockpile' : 'No resources left'
      continue
    }
    const job: Job = { ...option, id: state.nextId++, settlerId: settler.id }
    state.jobs.push(job); settler.jobId = job.id; settler.path = []; settler.pathRevision = -1
    settler.status = JOBS[job.kind].label
  }
}
export function jobDestination(state: WorldState, job: Job) {
  if (job.kind === 'gather' && job.stage !== 'target') return state.nodes.find(n => n.id === job.sourceId)!
  const id = job.stage === 'target' ? job.targetId : job.sourceId
  return entrance(state.buildings.find(b => b.id === id)!)
}
export function finishJob(state: WorldState, settler: Settler, job: Job): void {
  state.jobs.splice(state.jobs.indexOf(job), 1)
  settler.jobId = null; settler.path = []; settler.status = 'Needs work'
}
