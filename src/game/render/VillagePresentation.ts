import { RESOURCE_IDS } from '../data/resources'
import type { Building, Job, ResidentialPlot, ResourceNode, Settler, WorldState } from '../model/WorldState'

/** Rebuilt once per presentation frame; never stored in a save or used by gameplay. */
export class VillageRenderIndex {
  readonly jobs = new Map<number, Job>()
  readonly woodJobs = new Map<number, Job>()
  readonly nodes = new Map<number, ResourceNode>()
  readonly buildings = new Map<number, Building>()
  readonly plots = new Map<number, ResidentialPlot>()
  readonly occupiedHomes = new Set<number>()
  readonly staff = new Map<number, number>()

  refresh(state: WorldState): void {
    this.jobs.clear(); this.woodJobs.clear(); this.nodes.clear(); this.buildings.clear(); this.plots.clear()
    this.occupiedHomes.clear(); this.staff.clear()
    for (const job of state.jobs) {
      this.jobs.set(job.id, job)
      if (job.kind === 'gather' && job.resource === 'wood') this.woodJobs.set(job.sourceId, job)
    }
    for (const node of state.nodes) this.nodes.set(node.id, node)
    for (const building of state.buildings) this.buildings.set(building.id, building)
    for (const plot of state.residentialPlots) this.plots.set(plot.buildingId, plot)
    for (const settler of state.settlers) {
      if (settler.homeId !== null) this.occupiedHomes.add(settler.homeId)
      if (settler.health > 0 && settler.role === 'worker' && settler.workplaceId !== null) {
        const id = settler.workplaceId
        this.staff.set(id, (this.staff.get(id) ?? 0) + 1)
      }
    }
  }
}

/** A visible stack is a quantity band, not one mesh per stored resource unit. */
export function visibleStockUnits(amount: number, unitsPerProp: number, cap: number): number {
  return Math.min(cap, Math.max(0, Math.ceil(amount / unitsPerProp)))
}

export type WorkerActivity = 'idle' | 'walk' | 'carry' | 'gather' | 'build'

export function workerActivity(settler: Settler, job?: Job): WorkerActivity {
  if (settler.health <= 0) return 'idle'
  if (settler.path.length === 0 && job?.stage === 'work' && (job.kind === 'construct' || job.kind === 'repair')) return 'build'
  if (RESOURCE_IDS.some(resource => settler.cargo[resource] > 0)) return 'carry'
  if (settler.path.length > 0) return 'walk'
  if (job?.stage === 'work') {
    if (job.kind === 'gather') return 'gather'
  }
  return 'idle'
}
