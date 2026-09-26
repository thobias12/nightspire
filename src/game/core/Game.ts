import { FIXED_STEP } from '../data/jobs'
import type { BuildingId } from '../data/buildings'
import { SceneRenderer } from '../render/SceneRenderer'
import { assignHousing, cancelBuilding, freeStorage, placeBuilding, placementError, stockpiles } from '../simulation/Buildings'
import { damageBuilding } from '../simulation/Combat'
import { distance } from '../simulation/Navigation'
import { BACKUP_KEY, deserializeWorld, SAVE_KEY, serializeWorld, validateWorld } from '../simulation/SaveLoad'
import { Simulation } from '../simulation/Simulation'
import { createInitialWorldState, spawnSettler, type Point } from '../simulation/WorldState'
import { Hud, type Metrics } from '../ui/Hud'
import { InputController } from './InputController'

export class Game {
  private readonly renderer = new SceneRenderer()
  private readonly simulation = new Simulation(createInitialWorldState())
  private readonly hud: Hud
  private readonly input: InputController
  private readonly resizeObserver: ResizeObserver
  private readonly abort = new AbortController()
  private selectedId: number | null = null
  private buildType: BuildingId | null = null
  private pointer: Point | null = null
  private paused = false
  private speed = 1
  private message = 'Keep settlers fed, housed, safe and rested. Build a Campfire before dusk to prove the first needs loop.'
  private animationFrame = 0
  private lastTime = 0
  private accumulator = 0
  private hudTime = 0
  private metrics: Metrics = { frame: 16.7, simulation: 0, render: 0, calls: 0, triangles: 0, paths: 0, requests: 0, queue: 0, failures: 0, dropped: 0 }

  constructor(private readonly root: HTMLElement) {
    root.className = 'game-shell'; root.append(this.renderer.canvas)
    this.hud = new Hud(root, this.action)
    this.input = new InputController(this.renderer, this.simulation, () => this.action('cancel'), () => this.action('attack'))
    const signal = this.abort.signal
    this.renderer.canvas.addEventListener('pointermove', e => {
      const point = this.renderer.worldPoint(e.clientX, e.clientY)
      if (point?.x === this.pointer?.x && point?.z === this.pointer?.z) return
      this.pointer = point; this.updateGhost()
    }, { signal })
    this.renderer.canvas.addEventListener('pointerleave', () => { this.pointer = null; this.updateGhost() }, { signal })
    this.renderer.canvas.addEventListener('click', e => {
      this.renderer.canvas.focus()
      const p = this.renderer.worldPoint(e.clientX, e.clientY)
      if (!p) return
      const s = this.simulation.state
      if (this.buildType) {
        const error = placeBuilding(s, this.buildType, p)
        this.message = error ?? 'Blueprint placed. Settlers will supply and construct it during daylight.'
        if (!error) { this.selectedId = s.buildings.at(-1)!.id; this.buildType = null }
      } else {
        const nearby = [...s.settlers, ...s.enemies, ...s.buildings, ...s.nodes.filter(n => n.remaining > 0)].filter(e => distance(e, p) < 1.8).sort((a, b) => distance(a, p) - distance(b, p))
        this.selectedId = nearby[0]?.id ?? null
      }
      this.updateGhost(); this.updateHud()
    }, { signal })
    document.addEventListener('visibilitychange', () => { this.lastTime = 0; this.accumulator = 0 }, { signal })
    this.resizeObserver = new ResizeObserver(() => this.renderer.resize(root.clientWidth, root.clientHeight))
    this.resizeObserver.observe(root)
    this.renderer.resize(root.clientWidth, root.clientHeight)
    this.updateHud()
  }
  start(): void { if (!this.animationFrame) this.animationFrame = requestAnimationFrame(this.tick) }
  stop(): void {
    cancelAnimationFrame(this.animationFrame); this.animationFrame = 0
    this.abort.abort(); this.resizeObserver.disconnect(); this.input.dispose(); this.hud.dispose(); this.renderer.dispose()
  }
  private storePrimary(text: string): void {
    const previous = localStorage.getItem(SAVE_KEY)
    if (previous) localStorage.setItem(BACKUP_KEY, previous)
    localStorage.setItem(SAVE_KEY, text)
  }
  private replaceWorld(text: string): void {
    this.simulation.replace(deserializeWorld(text))
    this.accumulator = 0; this.selectedId = null; this.buildType = null
  }
  private exportSave(): void {
    const blob = new Blob([serializeWorld(this.simulation.state)], { type: 'application/json' })
    const url = URL.createObjectURL(blob), link = document.createElement('a')
    link.href = url; link.download = 'nightspire-day-' + this.simulation.state.day + '.json'
    document.body.append(link); link.click(); link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
  private readonly action = (action: string, value?: string): void => {
    const s = this.simulation.state
    try {
      switch (action) {
        case 'house': case 'stockpile': case 'guard-post': case 'wood-wall': case 'wood-gate': case 'campfire':
          this.buildType = action; this.renderer.mode = 'settlement'
          this.message = 'Click clear ground to place a ' + action + '. Esc cancels.'; break
        case 'cancel': this.buildType = null; this.message = 'Inspect mode. Click a settler, raider, resource or building.'; break
        case 'cancel-blueprint': {
          if (this.selectedId === null) { this.message = 'Select an unfinished blueprint first.'; break }
          const error = cancelBuilding(s, this.selectedId)
          if (error) this.message = error
          else { this.selectedId = null; this.message = 'Blueprint cancelled. Delivered and carried materials were returned safely.' }
          break
        }
        case 'toggle-role': {
          const settler = s.settlers.find(a => a.id === this.selectedId)
          if (!settler) { this.message = 'Select a settler first.'; break }
          settler.role = settler.role === 'guard' ? 'worker' : 'guard'
          settler.path = []; settler.pathRevision = -1
          this.message = settler.role === 'guard' ? 'Assigned as guard. During dusk/night they will report to an available Guard Post.' : 'Returned to worker duty.'
          break
        }
        case 'attack': {
          if (this.paused) { this.message = 'Resume the simulation to attack.'; break }
          const result = this.simulation.playerAttack()
          this.message = result.message
          break
        }
        case 'pause': this.paused = !this.paused; this.accumulator = 0; break
        case 'speed': this.speed = Number(value); break
        case 'time': this.simulation.setTimeOfDay(Number(value) / 24); break
        case 'jump-day': this.simulation.setTimeOfDay(12 / 24); break
        case 'jump-dusk': this.simulation.setTimeOfDay(18 / 24); break
        case 'jump-night': this.simulation.setTimeOfDay(21 / 24); break
        case 'jump-dawn': this.simulation.setTimeOfDay(5 / 24); break
        case 'next-raid': {
          this.simulation.setTimeOfDay(5 / 24)
          if (s.raid.lastSpawnDay === s.day) s.day++
          this.simulation.setTimeOfDay(6 / 24)
          this.simulation.setTimeOfDay(21 / 24)
          this.message = 'Advanced to raid wave ' + s.raid.wave + '. The new day meal and needs update were processed first.'
          break
        }
        case 'target-wood': case 'target-food': {
          const resource = action === 'target-wood' ? 'wood' : 'food'
          const target = Math.max(0, Math.min(10_000, Math.round(Number(value))))
          if (!Number.isFinite(target)) throw new Error('Stock target must be a number.')
          s.targets[resource] = target
          this.message = resource[0].toUpperCase() + resource.slice(1) + ' stock target set to ' + target + '.'
          break
        }
        case 'damage-selected': {
          const building = s.buildings.find(b => b.id === this.selectedId && b.complete)
          if (!building) { this.message = 'Select a completed structure first.'; break }
          const destroyed = damageBuilding(s, building, 60)
          assignHousing(s)
          this.message = destroyed
            ? 'QA destroyed the selected fortification. Daylight repair can rebuild it.'
            : 'QA dealt 60 structure damage. Daylight workers will repair it with wood.'
          break
        }
        case 'needs-low':
          for (const settler of s.settlers) settler.needs = { food: 25, housing: 25, safety: 25, recreation: 25 }
          this.message = 'QA set all settler needs to 25%.'; break
        case 'needs-reset':
          for (const settler of s.settlers) settler.needs = { food: 100, housing: 100, safety: 100, recreation: 100 }
          this.message = 'QA reset all settler needs to 100%.'; break
        case 'paths': this.renderer.debug = value === 'true'; break
        case 'spawn': this.message = spawnSettler(s) ? 'Settler joined the camp.' : 'M3.0 maximum remains 10 settlers.'; break
        case 'resources': {
          let added = 0
          for (const resource of ['wood', 'food'] as const) {
            let remaining = 50
            for (const b of stockpiles(s)) {
              const amount = Math.min(remaining, freeStorage(s, b))
              b.inventory[resource] += amount; remaining -= amount; added += amount
            }
          }
          this.message = 'QA added ' + added + ' resources within unreserved storage capacity.'; break
        }
        case 'camera': this.buildType = null; this.renderer.mode = this.renderer.mode === 'settlement' ? 'follow' : 'settlement'; break
        case 'center': this.renderer.mode = 'settlement'; this.renderer.focus.x = 0; this.renderer.focus.z = -1; this.renderer.angle = 0; this.renderer.zoom = 36; break
        case 'save': {
          this.storePrimary(serializeWorld(s))
          this.message = 'Saved locally. The previous primary save is kept as a backup.'
          break
        }
        case 'load': {
          const saved = localStorage.getItem(SAVE_KEY)
          if (!saved) { this.message = 'No local save yet. Use Save first.'; break }
          this.replaceWorld(saved)
          this.message = 'Loaded local settlement.'
          break
        }
        case 'load-backup': {
          const saved = localStorage.getItem(BACKUP_KEY)
          if (!saved) { this.message = 'No backup save exists yet.'; break }
          this.replaceWorld(saved)
          this.message = 'Loaded backup settlement. Use Save if you want to make it primary.'
          break
        }
        case 'export-save':
          this.exportSave(); this.message = 'Exported a validated Nightspire JSON save.'; break
        case 'import-save': {
          if (!value) throw new Error('No save file was provided.')
          const imported = deserializeWorld(value)
          const serialized = serializeWorld(imported)
          this.storePrimary(serialized)
          this.simulation.replace(imported); this.accumulator = 0; this.selectedId = null; this.buildType = null
          this.message = 'Imported and loaded save. The previous primary save is in the backup slot.'
          break
        }
        case 'import-error': throw new Error(value || 'Could not read the selected save file.')
        case 'audit': validateWorld(s); this.message = 'State integrity PASS: needs, meals, jobs, repairs, raid state, reservations, housing and connectivity.'; break
      }
    } catch (error) { this.message = error instanceof Error ? error.message : 'Operation failed. Current settlement retained.' }
    this.updateGhost(); this.updateHud()
  }
  private updateGhost(): void {
    const error = this.buildType && this.pointer ? placementError(this.simulation.state, this.buildType, this.pointer) : null
    this.renderer.showGhost(this.buildType, this.pointer, !error)
    if (this.buildType && this.pointer) this.message = error ?? 'Valid site. Click to place.'
  }
  private readonly tick = (timestamp: number): void => {
    const rawDelta = this.lastTime === 0 ? 0 : (timestamp - this.lastTime) / 1000
    const delta = Math.min(rawDelta, 0.1); this.lastTime = timestamp
    this.metrics.frame += (rawDelta * 1000 - this.metrics.frame) * 0.05
    this.input.update(delta, this.paused)
    const started = performance.now()
    if (!this.paused && !document.hidden) {
      this.accumulator += delta * this.speed
      this.metrics.dropped += Math.max(0, rawDelta - delta) * this.speed
    }
    const previousRequests = this.simulation.navigation.requests
    let steps = 0, paths = 0
    while (this.accumulator >= FIXED_STEP && steps < 8) {
      this.simulation.step(); this.accumulator -= FIXED_STEP; steps++; paths += this.simulation.navigation.solved
    }
    if (this.accumulator >= FIXED_STEP) { this.metrics.dropped += this.accumulator; this.accumulator = 0 }
    this.metrics.simulation += (performance.now() - started - this.metrics.simulation) * 0.1
    const renderStarted = performance.now()
    this.renderer.sync(this.simulation.state, this.selectedId)
    this.hudTime += delta
    if (this.hudTime >= 0.2) {
      this.renderer.updatePaths(this.simulation.state); this.updateGhost(); this.updateHud(); this.hudTime = 0
    }
    this.renderer.render()
    this.metrics.render += (performance.now() - renderStarted - this.metrics.render) * 0.1
    Object.assign(this.metrics, this.renderer.stats, { paths, requests: this.simulation.navigation.requests - previousRequests, queue: this.simulation.navigation.depth, failures: this.simulation.navigation.failures })
    this.animationFrame = requestAnimationFrame(this.tick)
  }
  private updateHud(): void {
    this.hud.update(this.simulation.state, { paused: this.paused, selectedId: this.selectedId, buildType: this.buildType, message: this.message, camera: this.renderer.mode, metrics: this.metrics })
  }
}
