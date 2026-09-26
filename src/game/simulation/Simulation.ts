import { BUILDINGS } from '../data/buildings'
import { DECISION_TICKS, FIXED_STEP, WALK_SPEED } from '../data/jobs'
import { RESOURCES } from '../data/resources'
import { assignHousing } from './Buildings'
import { assignJobs, finishJob, jobDestination } from './Jobs'
import { distance, Navigation } from './Navigation'
import { recordEvent, type Job, type Settler, type WorldState } from './WorldState'

export class Simulation {
  readonly navigation = new Navigation()
  constructor(public state: WorldState) {}
  replace(state: WorldState): void { this.state = state; this.navigation.reset() }
  step(): void {
    const s = this.state
    s.tick++; s.elapsedSeconds += FIXED_STEP
    s.timeOfDay += FIXED_STEP / 360
    if (s.timeOfDay >= 1) { s.timeOfDay -= 1; s.day++ }
    this.navigation.sync(s)
    if (s.tick % DECISION_TICKS === 1) { assignJobs(s); assignHousing(s) }
    for (const settler of s.settlers) {
      const job = s.jobs.find(j => j.id === settler.jobId)
      if (!job) continue
      if (job.stage === 'work') { this.work(settler, job); continue }
      const target = jobDestination(s, job)
      if (distance(settler, target) < 0.01) { this.arrive(settler, job); continue }
      settler.status = job.stage === 'target' ? 'Carrying ' + job.amount + ' ' + job.resource : 'Travel to ' + job.kind
      if (settler.pathRevision !== s.topology || settler.path.length === 0) {
        this.navigation.request(settler.id, target); continue
      }
      let budget = WALK_SPEED * FIXED_STEP
      while (budget > 0 && settler.path.length) {
        const next = settler.path[0], length = distance(settler, next)
        if (length <= budget) { settler.x = next.x; settler.z = next.z; settler.path.shift(); budget -= length }
        else { settler.x += (next.x - settler.x) / length * budget; settler.z += (next.z - settler.z) / length * budget; budget = 0 }
      }
    }
    this.navigation.process(s)
  }
  private arrive(settler: Settler, job: Job): void {
    const s = this.state
    settler.path = []; settler.pathRevision = -1
    if (job.stage === 'target') {
      const target = s.buildings.find(b => b.id === job.targetId)!
      if (job.kind === 'gather') {
        target.inventory[job.resource] += job.amount
        s.totals.deposited[job.resource] += job.amount
        recordEvent(s, 'Settler ' + settler.id + ' deposited ' + job.amount + ' ' + job.resource + '.')
      } else {
        target.delivered[job.resource] += job.amount
        s.totals.delivered[job.resource] += job.amount
        recordEvent(s, job.amount + ' ' + job.resource + ' delivered to ' + BUILDINGS[target.type].label + '.')
      }
      settler.cargo[job.resource] = 0; finishJob(s, settler, job)
    } else if (job.kind === 'deliver') {
      const source = s.buildings.find(b => b.id === job.sourceId)!
      source.inventory[job.resource] -= job.amount
      settler.cargo[job.resource] = job.amount; job.stage = 'target'
    } else { job.stage = 'work'; job.progress = 0 }
  }
  private work(settler: Settler, job: Job): void {
    const s = this.state
    job.progress += FIXED_STEP
    if (job.kind === 'gather') {
      settler.status = 'Gathering ' + job.resource
      if (job.progress + 1e-8 < RESOURCES[job.resource].workSeconds) return
      const node = s.nodes.find(n => n.id === job.sourceId)!
      node.remaining -= job.amount; settler.cargo[job.resource] = job.amount
      s.totals.gathered[job.resource] += job.amount; job.stage = 'target'; settler.pathRevision = -1
    } else {
      const building = s.buildings.find(b => b.id === job.targetId)!
      settler.status = 'Constructing ' + BUILDINGS[building.type].label
      building.work = Math.min(BUILDINGS[building.type].constructionWork, building.work + FIXED_STEP)
      if (building.work + 1e-8 < BUILDINGS[building.type].constructionWork) return
      building.work = BUILDINGS[building.type].constructionWork
      building.complete = true; s.totals.constructed++
      recordEvent(s, BUILDINGS[building.type].label + ' completed.')
      assignHousing(s); finishJob(s, settler, job)
    }
  }
}
