import { emptyInventory, type Inventory, type ResourceId } from '../data/resources'
import type { Job } from './WorldState'

/** Derived once per assignment pass, then extended as that pass assigns jobs.
 * Never persisted: active jobs remain the source of truth. */
export class JobReservations {
  private pickups = new Map<number, Inventory>()
  private deliveries = new Map<number, Inventory>()
  private supplies = new Map<number, Inventory>()
  private storage = new Map<number, number>()
  readonly gathered = emptyInventory()
  readonly gatherSources = new Set<number>()
  readonly repairTargets = new Set<number>()
  readonly constructTargets = new Set<number>()
  repairWood = 0

  constructor(jobs: readonly Job[]) { for (const job of jobs) this.add(job) }

  pickup(id: number, resource: ResourceId): number { return this.pickups.get(id)?.[resource] ?? 0 }
  delivered(id: number, resource: ResourceId): number { return this.deliveries.get(id)?.[resource] ?? 0 }
  supplied(id: number, resource: ResourceId): number { return this.supplies.get(id)?.[resource] ?? 0 }
  incoming(id: number): number { return this.storage.get(id) ?? 0 }

  private increment(map: Map<number, Inventory>, id: number, resource: ResourceId, amount: number): void {
    let inventory = map.get(id)
    if (!inventory) { inventory = emptyInventory(); map.set(id, inventory) }
    inventory[resource] += amount
  }

  add(job: Job): void {
    if ((job.kind === 'deliver' || job.kind === 'repair' || job.kind === 'supply') && job.stage === 'source') {
      this.increment(this.pickups, job.sourceId, job.resource, job.amount)
    }
    if (job.kind === 'deliver') this.increment(this.deliveries, job.targetId, job.resource, job.amount)
    if (job.kind === 'supply') this.increment(this.supplies, job.targetId, job.resource, job.amount)
    if (job.kind === 'gather' || job.kind === 'supply') {
      this.storage.set(job.targetId, this.incoming(job.targetId) + job.amount)
    }
    if (job.kind === 'gather') {
      this.gathered[job.resource] += job.amount
      this.gatherSources.add(job.sourceId)
    }
    if (job.kind === 'repair') { this.repairWood += job.amount; this.repairTargets.add(job.targetId) }
    if (job.kind === 'construct') this.constructTargets.add(job.targetId)
  }
}
