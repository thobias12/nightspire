import { BUILDINGS } from '../data/buildings'
import {
  DECISION_TICKS, FIXED_STEP, REPAIR_HP_PER_WOOD, REPAIR_WORK_SECONDS, WALK_SPEED,
} from '../data/jobs'
import { RESOURCES } from '../data/resources'
import { assignHousing } from './Buildings'
import {
  GUARD_AGGRO_RANGE, GUARD_ATTACK_COOLDOWN, GUARD_ATTACK_RANGE, GUARD_DAMAGE,
  RAIDER_ATTACK_COOLDOWN, RAIDER_ATTACK_RANGE, RAIDER_DAMAGE, RAIDER_STRUCTURE_DAMAGE,
  damageBuilding, damageEnemy, damagePlayer, damageSettler, livingGuards, nearestEnemy,
  playerAttack as performPlayerAttack, restoreAtDawn, tickCombatCooldowns, type AttackResult,
} from './Combat'
import { isWorkPhase, phaseForTime, type DayPhase } from './DayNight'
import { essentialJob, happinessEffect } from './Happiness'
import { assignJobs, finishJob, jobDestination } from './Jobs'
import { distance, Navigation } from './Navigation'
import { serveDailyMeal, updateNeeds } from './Needs'
import { processImmigrationDay } from './Population'
import { updateProduction } from './Production'
import { updateServices } from './Services'
import { ENEMY_WALK_SPEED, enemyTarget, enemyTargetBuilding, retreatRaid, spawnNightRaid } from './Raid'
import { nightTarget } from './Schedule'
import {
  recordEvent, settlerLabel, type Enemy, type Job, type Point, type Settler, type WorldState,
} from './WorldState'

type MovingAgent = Settler | Enemy

export class Simulation {
  readonly navigation = new Navigation()
  private lastPhase: DayPhase

  constructor(public state: WorldState) {
    this.lastPhase = phaseForTime(state.timeOfDay)
    if (this.lastPhase === 'night') this.beginRaid()
  }

  get phase(): DayPhase { return phaseForTime(this.state.timeOfDay) }

  replace(state: WorldState): void {
    this.state = state
    this.navigation.reset()
    this.lastPhase = phaseForTime(state.timeOfDay)
    if (this.lastPhase === 'night') this.beginRaid()
  }

  playerAttack(): AttackResult {
    return performPlayerAttack(this.state)
  }

  setTimeOfDay(timeOfDay: number): void {
    this.state.timeOfDay = ((timeOfDay % 1) + 1) % 1
    const next = phaseForTime(this.state.timeOfDay)
    if (next !== this.lastPhase) this.transition(this.lastPhase, next)
    this.lastPhase = next
  }

  step(): void {
    const s = this.state
    s.tick++
    s.elapsedSeconds += FIXED_STEP
    tickCombatCooldowns(s, FIXED_STEP)

    s.timeOfDay += FIXED_STEP / 360
    if (s.timeOfDay >= 1) { s.timeOfDay -= 1; s.day++ }

    const phase = phaseForTime(s.timeOfDay)
    if (phase !== this.lastPhase) {
      this.transition(this.lastPhase, phase)
      this.lastPhase = phase
    }

    this.navigation.sync(s)
    updateProduction(s, FIXED_STEP, phase)

    if (isWorkPhase(phase) && s.tick % DECISION_TICKS === 1) {
      serveDailyMeal(s)
      assignJobs(s)
      assignHousing(s)
    }

    for (const settler of s.settlers) {
      if (settler.health <= 0) {
        settler.path = []
        settler.pathRevision = -1
        settler.status = 'Downed until dawn'
        continue
      }

      if (settler.arrivalTarget) {
        this.updateImmigrantArrival(settler)
        continue
      }

      const job = s.jobs.find(j => j.id === settler.jobId)
      if (job) this.updateJob(settler, job)
      else if (!isWorkPhase(phase)) {
        if (phase === 'night' && settler.role === 'guard' && s.enemies.length > 0) this.updateGuardCombat(settler)
        else this.updateNightSchedule(settler)
      } else if (
        settler.status !== 'Needs work'
        && settler.status !== 'Stock targets met'
        && !settler.status.startsWith('Storage')
        && settler.status !== 'No resources left'
        && !settler.status.startsWith('No usable')
      ) {
        settler.status = 'Needs work'
      }
    }

    if (phase === 'night') {
      for (const enemy of [...s.enemies]) {
        if (s.enemies.includes(enemy)) this.updateEnemy(enemy)
      }
    }

    updateNeeds(s, FIXED_STEP, phase)
    updateServices(s, FIXED_STEP, phase)
    this.navigation.process(s)
  }

  private beginRaid(): void {
    const count = spawnNightRaid(this.state)
    if (count > 0) recordEvent(this.state, 'Raid wave ' + this.state.raid.wave + ': ' + count + ' raiders enter from the wilds.')
  }

  private transition(previous: DayPhase, next: DayPhase): void {
    const s = this.state

    if (previous === 'night' && next !== 'night') {
      const retreated = retreatRaid(s)
      restoreAtDawn(s)
      assignHousing(s)
      const damaged = s.buildings.filter(b => b.complete && b.health < b.maxHealth).length
      if (retreated > 0) recordEvent(s, retreated + ' raiders retreat with the returning light.')
      if (damaged > 0) recordEvent(s, damaged + ' damaged structures await daylight repairs.')
    }

    if (next !== 'day') {
      this.releaseNonCarryingJobs()
      for (const settler of s.settlers) {
        if (settler.jobId === null) {
          settler.path = []
          settler.pathRevision = -1
        }
      }
    }

    if (next === 'dusk') {
      recordEvent(s, 'Dusk falls. Work stops; civilians seek shelter and guards report to posts.')
    } else if (next === 'night') {
      this.beginRaid()
      recordEvent(s, 'Night has fallen. The settlement is on alert.')
    } else if (next === 'dawn') {
      recordEvent(s, 'Dawn breaks. The wounded recover; repairs begin at 06:00.')
    } else if (next === 'day') {
      assignHousing(s)
      const immigration = processImmigrationDay(s)
      if (immigration.arrived) assignHousing(s)
      serveDailyMeal(s, true)
      for (const settler of s.settlers) {
        if (settler.jobId === null) {
          settler.path = []
          settler.pathRevision = -1
          settler.status = 'Needs work'
        }
      }
      this.navigation.reset()
      recordEvent(s, previous === 'dawn' ? 'Day begins. Repairs and normal work resume.' : 'Daylight returns. Repairs and normal work resume.')
    }
  }

  private releaseNonCarryingJobs(): void {
    const s = this.state
    const keep = new Set<number>()

    for (const job of s.jobs) {
      const settler = s.settlers.find(a => a.id === job.settlerId)
      if (!settler) continue

      const carrying = Object.values(settler.cargo).some(amount => amount > 0)
      if (carrying) {
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
    const morale = happinessEffect(settler)

    if (job.stage !== 'target' && morale.refusesNonessential && !essentialJob(job)) {
      finishJob(s, settler, job)
      settler.status = morale.label + ' — essentials only'
      return
    }

    if (job.stage === 'work') {
      this.work(settler, job, morale.workRate)
      return
    }

    const target = jobDestination(s, job)
    if (distance(settler, target) < 0.01) {
      this.arrive(settler, job)
      return
    }

    const status = job.stage === 'target'
      ? job.kind === 'repair'
        ? 'Carrying repair timber'
        : job.kind === 'supply'
          ? 'Supplying ' + BUILDINGS[s.buildings.find(b => b.id === job.targetId)!.type].label
          : 'Carrying ' + job.amount + ' ' + job.resource
      : 'Travel to ' + job.kind
    this.move(settler, target, status, WALK_SPEED)
  }

  private updateImmigrantArrival(settler: Settler): void {
    const target = settler.arrivalTarget
    if (!target) return

    if (distance(settler, target) < 0.01) {
      settler.arrivalTarget = null
      settler.path = []
      settler.pathRevision = -1
      settler.status = 'Arrived — needs work'
      recordEvent(this.state, settlerLabel(this.state, settler.id) + ' arrived in Nightspire.')
      return
    }

    this.move(settler, target, 'Arriving in Nightspire', WALK_SPEED)
  }

  private updateNightSchedule(settler: Settler): void {
    const { target, status } = nightTarget(this.state, settler, this.phase)

    if (distance(settler, target) < 0.01) {
      settler.path = []
      settler.pathRevision = -1
      settler.status = status
      return
    }

    const moving = settler.role === 'guard'
      ? (status.startsWith('Guard reserve') ? 'Guard reserve — seeking shelter' : 'Reporting to guard post')
      : 'Seeking shelter'
    this.move(settler, target, moving, WALK_SPEED)
  }

  private updateGuardCombat(guard: Settler): void {
    const s = this.state
    const enemy = nearestEnemy(s, guard, GUARD_AGGRO_RANGE)
    if (!enemy) {
      this.updateNightSchedule(guard)
      return
    }

    const d = distance(guard, enemy)
    if (d <= GUARD_ATTACK_RANGE) {
      guard.path = []
      guard.pathRevision = -1
      guard.status = 'Fighting raider'
      if (guard.attackCooldown <= 0) {
        guard.attackCooldown = GUARD_ATTACK_COOLDOWN
        const killed = damageEnemy(s, enemy, GUARD_DAMAGE, settlerLabel(s, guard.id))
        if (killed) guard.status = 'Defeated raider'
      }
      return
    }

    this.move(guard, enemy, 'Intercepting raider', WALK_SPEED)
  }

  private updateEnemy(enemy: Enemy): void {
    const s = this.state

    const guards = livingGuards(s)
      .filter(guard => distance(enemy, guard) <= RAIDER_ATTACK_RANGE)
      .sort((a, b) => distance(enemy, a) - distance(enemy, b))

    if (guards[0]) {
      enemy.path = []
      enemy.pathRevision = -1
      enemy.status = 'Attacking ' + settlerLabel(s, guards[0].id)
      if (enemy.attackCooldown <= 0) {
        enemy.attackCooldown = RAIDER_ATTACK_COOLDOWN
        damageSettler(s, guards[0], RAIDER_DAMAGE)
      }
      return
    }

    if (s.player.health > 0 && distance(enemy, s.player) <= RAIDER_ATTACK_RANGE) {
      enemy.path = []
      enemy.pathRevision = -1
      enemy.status = 'Attacking player'
      if (enemy.attackCooldown <= 0) {
        enemy.attackCooldown = RAIDER_ATTACK_COOLDOWN
        damagePlayer(s, RAIDER_DAMAGE)
      }
      return
    }

    const targetBuilding = enemyTargetBuilding(s, enemy)
    if (!targetBuilding) {
      enemy.status = 'No settlement target'
      enemy.path = []
      return
    }

    const target = enemyTarget(s, enemy)
    if (distance(enemy, target) < 0.08) {
      enemy.path = []
      enemy.pathRevision = -1
      enemy.status = 'Attacking ' + BUILDINGS[targetBuilding.type].label

      if (enemy.attackCooldown <= 0) {
        enemy.attackCooldown = RAIDER_ATTACK_COOLDOWN
        const destroyed = damageBuilding(s, targetBuilding, RAIDER_STRUCTURE_DAMAGE)
        if (destroyed) {
          enemy.path = []
          enemy.pathRevision = -1
          assignHousing(s)
        }
      }
      return
    }

    this.move(enemy, target, 'Advancing on ' + BUILDINGS[targetBuilding.type].label, ENEMY_WALK_SPEED)
  }

  private move(agent: MovingAgent, target: Point, status: string, speed: number): void {
    const s = this.state
    agent.status = status

    if (agent.pathRevision !== s.topology || agent.path.length === 0) {
      if (!this.navigation.request(agent.id, target, s.tick) && this.navigation.isRetrying(agent.id, s.tick)) {
        agent.status = 'Route blocked — retrying'
      }
      return
    }

    let budget = speed * FIXED_STEP
    while (budget > 0 && agent.path.length) {
      const next = agent.path[0]
      const length = distance(agent, next)
      if (length <= budget) {
        agent.x = next.x
        agent.z = next.z
        agent.path.shift()
        budget -= length
      } else {
        agent.x += (next.x - agent.x) / length * budget
        agent.z += (next.z - agent.z) / length * budget
        budget = 0
      }
    }
  }

  private arrive(settler: Settler, job: Job): void {
    const s = this.state
    settler.path = []
    settler.pathRevision = -1

    if (job.stage === 'target') {
      const target = s.buildings.find(b => b.id === job.targetId)
      if (!target) {
        finishJob(s, settler, job)
        return
      }

      if (job.kind === 'repair') {
        job.stage = 'work'
        job.progress = 0
        settler.status = 'Repairing ' + BUILDINGS[target.type].label
        return
      }

      if (job.kind === 'supply') {
        target.inventory[job.resource] += job.amount
        recordEvent(s, job.amount + ' ' + job.resource + ' supplied to ' + BUILDINGS[target.type].label + '.')
      } else if (job.kind === 'gather') {
        if (target.destroyed) {
          finishJob(s, settler, job)
          return
        }
        target.inventory[job.resource] += job.amount
        s.totals.deposited[job.resource] += job.amount
        recordEvent(s, settlerLabel(s, settler.id) + ' deposited ' + job.amount + ' ' + job.resource + '.')
      } else {
        target.delivered[job.resource] += job.amount
        s.totals.delivered[job.resource] += job.amount
        recordEvent(s, job.amount + ' ' + job.resource + ' delivered to ' + BUILDINGS[target.type].label + '.')
      }

      settler.cargo[job.resource] = 0
      finishJob(s, settler, job)
      return
    }

    if (job.kind === 'deliver' || job.kind === 'repair' || job.kind === 'supply') {
      const source = s.buildings.find(b => b.id === job.sourceId)
      if (!source || source.inventory[job.resource] < job.amount) {
        finishJob(s, settler, job)
        return
      }
      source.inventory[job.resource] -= job.amount
      settler.cargo[job.resource] = job.amount
      job.stage = 'target'
      return
    }

    job.stage = 'work'
    job.progress = 0
  }

  private work(settler: Settler, job: Job, workRate: number): void {
    const s = this.state
    const workDelta = FIXED_STEP * workRate
    job.progress += workDelta

    if (job.kind === 'gather') {
      settler.status = 'Gathering ' + job.resource
      if (job.progress + 1e-8 < RESOURCES[job.resource].workSeconds) return

      const node = s.nodes.find(n => n.id === job.sourceId)
      if (!node || node.remaining < job.amount) {
        finishJob(s, settler, job)
        return
      }

      node.remaining -= job.amount
      settler.cargo[job.resource] = job.amount
      s.totals.gathered[job.resource] += job.amount
      job.stage = 'target'
      settler.pathRevision = -1
      return
    }

    const building = s.buildings.find(b => b.id === job.targetId)
    if (!building) {
      for (const resource of Object.keys(settler.cargo) as Array<keyof typeof settler.cargo>) settler.cargo[resource] = 0
      finishJob(s, settler, job)
      return
    }

    if (job.kind === 'repair') {
      settler.status = 'Repairing ' + BUILDINGS[building.type].label
      if (job.progress + 1e-8 < REPAIR_WORK_SECONDS) return

      const missing = Math.max(0, building.maxHealth - building.health)
      const heal = Math.min(missing, job.amount * REPAIR_HP_PER_WOOD)
      const woodUsed = Math.min(job.amount, Math.ceil(heal / REPAIR_HP_PER_WOOD))
      const unused = job.amount - woodUsed
      const wasDestroyed = building.destroyed

      building.health = Math.min(building.maxHealth, building.health + heal)
      if (building.health > 0) building.destroyed = false
      building.lastHitTick = 0
      s.totals.repairedHealth += heal
      s.totals.repairWoodUsed += woodUsed
      settler.cargo.wood = 0

      if (unused > 0) {
        const source = s.buildings.find(b => b.id === job.sourceId)
        if (source) source.inventory.wood += unused
      }

      if (wasDestroyed !== building.destroyed) s.topology++
      recordEvent(s, BUILDINGS[building.type].label + ' repaired +' + heal + ' HP.')
      assignHousing(s)
      finishJob(s, settler, job)
      return
    }

    settler.status = 'Constructing ' + BUILDINGS[building.type].label
    building.work = Math.min(BUILDINGS[building.type].constructionWork, building.work + workDelta)
    if (building.work + 1e-8 < BUILDINGS[building.type].constructionWork) return

    building.work = BUILDINGS[building.type].constructionWork
    building.complete = true
    building.destroyed = false
    building.health = building.maxHealth
    building.lastHitTick = 0
    s.totals.constructed++
    s.topology++
    recordEvent(s, BUILDINGS[building.type].label + ' completed.')
    assignHousing(s)
    finishJob(s, settler, job)
  }
}
