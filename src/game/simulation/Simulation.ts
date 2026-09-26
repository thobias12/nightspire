import { BUILDINGS } from '../data/buildings'
import { DECISION_TICKS, FIXED_STEP, WALK_SPEED } from '../data/jobs'
import { RESOURCES } from '../data/resources'
import { assignHousing } from './Buildings'
import { isWorkPhase, phaseForTime, type DayPhase } from './DayNight'
import { assignJobs, finishJob, jobDestination } from './Jobs'
import { distance, Navigation } from './Navigation'
import { nightTarget } from './Schedule'
import { recordEvent, settlerLabel, type Job, type Point, type Settler, type WorldState } from './WorldState'

export class Simulation {
  readonly navigation = new Navigation()
  private lastPhase: DayPhase

  constructor(public state: WorldState) {
    this.lastPhase = phaseForTime(state.timeOfDay)
  }

  get phase(): DayPhase { return phaseForTime(this.state.timeOfDay) }

  replace(state: WorldState): void {
    this.state = state
    this.navigation.reset()
    this.lastPhase = phaseForTime(state.timeOfDay)
  }

  setTimeOfDay(timeOfDay: number): void {
    this.state.timeOfDay = ((timeOfDay % 1) + 1) % 1
    const next = phaseForTime(this.state.timeOfDay)
    if (next !== this.lastPhase) this.transition(this.lastPhase, next)
    this.lastPhase = next
  }

  step(): void {
    const s = this.state
    s.tick++; s.elapsedSeconds += FIXED_STEP
    s.timeOfDay += FIXED_STEP / 360
    if (s.timeOfDay >= 1) { s.timeOfDay -= 1; s.day++ }

    const phase = phaseForTime(s.timeOfDay)
    if (phase !== this.lastPhase) {
      this.transition(this.lastPhase, phase)
      this.lastPhase = phase
    }

    this.navigation.sync(s)
    if (isWorkPhase(phase) && s.tick % DECISION_TICKS === 1) {
      assignJobs(s)
      assignHousing(s)
    }

    for (const settler of s.settlers) {
      const job = s.jobs.find(j => j.id === settler.jobId)
      if (job) this.updateJob(settler, job)
      else if (!isWorkPhase(phase)) this.updateNightSchedule(settler)
      else if (settler.status !== 'Needs work' && settler.status !== 'Stock targets met' && !settler.status.startsWith('Storage') && settler.status !== 'No resources left')
        settler.status = 'Needs work'
    }
    this.navigation.process(s)
  }

  private transition(previous: DayPhase, next: DayPhase): void {
    const s = this.state
    if (next !== 'day') this.releaseNonCarryingJobs()
    if (next === 'dusk') {
      recordEvent(s, 'Dusk falls. Work stops; civilians seek shelter and guards report to posts.')
    } else if (next === 'night') {
      recordEvent(s, 'Night has fallen. The settlement is on alert.')
    } else if (next === 'dawn') {
      recordEvent(s, 'Dawn breaks. The settlement waits for daylight.')
    } else if (next === 'day') {
      for (const settler of s.settlers) {
        if (settler.jobId === null) {
          settler.path = []; settler.pathRevision = -1; settler.status = 'Needs work'
        }
      }
      this.navigation.reset()
      recordEvent(s, previous === 'dawn' ? 'Day begins. Normal work resumes.' : 'Daylight returns. Normal work resumes.')
    }
  }

  private releaseNonCarryingJobs(): void {
    const s = this.state
    const keep = new Set<number>()
    for (const job of s.jobs) {
      const settler = s.settlers.find(a => a.id === job.settlerId)
      if (!settler) continue
      if (job.stage === 'target') {
        keep.add(job.id)
        continue
      }
      settler.jobId = null
      settler.path = []
      settler.pathRevision = -1
      settler.status = 'Leaving work for dusk'
    }
    s.jobs = s.jobs.filter(job => keep.has(job.id))
  }

  private updateJob(settler: Settler, job: Job): void {
    const s = this.state
    if (job.stage === 'work') { this.work(settler, job); return }
    const target = jobDestination(s, job)
    if (distance(settler, target) < 0.01) { this.arrive(settler, job); return }
    const status = job.stage === 'target' ? 'Carrying ' + job.amount + ' ' + job.resource : 'Travel to ' + job.kind
    this.move(settler, target, status)
  }

  private updateNightSchedule(settler: Settler): void {
    const { target, status } = nightTarget(this.state, settler)
    if (distance(settler, target) < 0.01) {
      settler.path = []; settler.pathRevision = -1; settler.status = status
      return
    }
    const moving = settler.role === 'guard'
      ? (status.startsWith('Guard reserve') ? 'Guard reserve — seeking shelter' : 'Reporting to guard post')
      : 'Seeking shelter'
    this.move(settler, target, moving)
  }

  private move(settler: Settler, target: Point, status: string): void {
    const s = this.state
    settler.status = status
    if (settler.pathRevision !== s.topology || settler.path.length === 0) {
      if (!this.navigation.request(settler.id, target, s.tick) && this.navigation.isRetrying(settler.id, s.tick))
        settler.status = 'Route blocked — retrying'
      return
    }
    let budget = WALK_SPEED * FIXED_STEP
    while (budget > 0 && settler.path.length) {
      const next = settler.path[0], length = distance(settler, next)
      if (length <= budget) { settler.x = next.x; settler.z = next.z; settler.path.shift(); budget -= length }
      else { settler.x += (next.x - settler.x) / length * budget; settler.z += (next.z - settler.z) / length * budget; budget = 0 }
    }
  }

  private arrive(settler: Settler, job: Job): void {
    const s = this.state
    settler.path = []; settler.pathRevision = -1
    if (job.stage === 'target') {
      const target = s.buildings.find(b => b.id === job.targetId)!
      if (job.kind === 'gather') {
        target.inventory[job.resource] += job.amount
        s.totals.deposited[job.resource] += job.amount
        recordEvent(s, settlerLabel(s, settler.id) + ' deposited ' + job.amount + ' ' + job.resource + '.')
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
