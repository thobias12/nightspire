import { FIXED_STEP } from '../data/jobs'
import { BUILDINGS, type BuildingId } from '../data/buildings'
import { SceneRenderer } from '../render/SceneRenderer'
import {
  assignHousing,
  cancelBuilding,
  demolishBuilding,
  freeStorage,
  placeBuilding,
  placeBuildingBatch,
  placementBatchError,
  placementError,
  stockpiles,
  wallLinePoints,
} from '../simulation/Buildings'
import { damageBuilding } from '../simulation/Combat'
import { distance } from '../simulation/Navigation'
import { forceImmigrationIfEligible } from '../simulation/Population'
import { BACKUP_KEY, deserializeWorld, SAVE_KEY, serializeWorld, validateWorld } from '../simulation/SaveLoad'
import { Simulation } from '../simulation/Simulation'
import {
  backyardForPlot,
  buildingPlacementPreview,
  insertRoadJunctionPoint,
  residentialPlotBuildingError,
  residentialPlotError,
  residentialPlotPreview,
  residentialPlotResourceError,
  roadPlacementError,
  sampleRoadCurve,
  snapRoadPlacementPoint,
  type ResidentialPlotPreview,
} from '../simulation/TownPlanning'
import { createBuilding, createInitialWorldState, spawnSettler, type Point } from '../simulation/WorldState'
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
  private buildRotation = 0
  private planningTool: 'road' | 'residential-plot' | null = null
  private planningStart: Point | null = null
  private roadControls: Point[] = []
  private roadDraft: Point[] = []
  private roadHover: Point | null = null
  private roadWidth = 1.7
  private roadCurvature = 0.7
  private roadJoinSnap = true
  private plotDraft: ResidentialPlotPreview | null = null
  private pointer: Point | null = null
  private rawPointer: Point | null = null
  private gridSnap = true
  private roadSnap = true
  private dragStart: Point | null = null
  private dragPoints: Point[] = []
  private suppressClick = false
  private paused = false
  private speed = 1
  private message = 'Create spare housing, keep people happy and safe, and make Nightspire attractive to new settlers.'
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
      const precise = this.renderer.worldPointPrecise(e.clientX, e.clientY)
      this.rawPointer = precise
      const point = this.planningTool ? precise : (precise ? { x: Math.round(precise.x), z: Math.round(precise.z) } : null)
      if (
        !this.planningTool
        && point?.x === this.pointer?.x
        && point?.z === this.pointer?.z
        && !(this.dragStart && this.buildType === 'wood-wall')
        && !(this.buildType && this.roadSnap)
      ) return
      this.pointer = point

      if (this.planningTool === 'road' && precise) {
        const hover = snapRoadPlacementPoint(
          this.simulation.state.roads,
          precise,
          this.gridSnap,
          this.roadJoinSnap,
        )
        this.roadHover = hover
        if (this.roadControls.length) {
          const last = this.roadControls[this.roadControls.length - 1]
          const previewControls = Math.hypot(hover.x - last.x, hover.z - last.z) > 0.08
            ? [...this.roadControls, hover]
            : [...this.roadControls]
          this.roadDraft = sampleRoadCurve(previewControls, this.roadCurvature)
        } else {
          this.roadDraft = []
        }
      } else if (this.planningTool === 'residential-plot' && this.planningStart && precise) {
        this.plotDraft = residentialPlotPreview(
          this.simulation.state.roads,
          this.planningStart,
          precise,
          2.2,
          this.gridSnap,
          this.simulation.state.residentialPlots,
        )
      } else if (this.dragStart && point && this.buildType === 'wood-wall') {
        this.dragPoints = wallLinePoints(this.dragStart, point)
      }
      this.updateGhost()
    }, { signal })
    this.renderer.canvas.addEventListener('pointerleave', () => {
      if (this.dragStart || this.planningStart || this.roadControls.length) return
      this.pointer = null
      this.rawPointer = null
      this.updateGhost()
    }, { signal })
    this.renderer.canvas.addEventListener('pointerdown', e => {
      if (e.button !== 0) return

      if (this.planningTool === 'road') {
        this.renderer.canvas.focus()
        e.preventDefault()
        return
      }

      if (this.planningTool === 'residential-plot') {
        const raw = this.renderer.worldPointPrecise(e.clientX, e.clientY)
        if (!raw) return
        this.renderer.canvas.focus()
        this.planningStart = raw
        this.pointer = raw
        this.rawPointer = raw
        this.plotDraft = null
        this.renderer.canvas.setPointerCapture(e.pointerId)
        this.updateGhost()
        e.preventDefault()
        return
      }

      if (this.buildType !== 'wood-wall') return
      const point = this.renderer.worldPoint(e.clientX, e.clientY)
      if (!point) return
      this.renderer.canvas.focus()
      this.dragStart = point
      this.pointer = point
      this.dragPoints = [point]
      this.renderer.canvas.setPointerCapture(e.pointerId)
      this.updateGhost()
      e.preventDefault()
    }, { signal })
    this.renderer.canvas.addEventListener('pointerup', e => {
      if (e.button !== 0) return

      if (this.planningStart && this.planningTool === 'residential-plot') {
        const s = this.simulation.state
        const rawEnd = this.renderer.worldPointPrecise(e.clientX, e.clientY) ?? this.rawPointer ?? this.pointer ?? this.planningStart
        const preview = residentialPlotPreview(s.roads, this.planningStart, rawEnd, 2.2, this.gridSnap, s.residentialPlots)
        let error = residentialPlotError(preview, s.residentialPlots)
        if (!error) error = residentialPlotBuildingError(preview, s.buildings)
        if (!error) error = residentialPlotResourceError(preview, s.nodes)
        if (!error && preview) error = placementError(s, 'house', preview.housePoint)

        if (error || !preview) {
          this.message = error ?? 'Could not create that residential plot.'
        } else {
          const before = s.nextId
          const houseError = placeBuilding(s, 'house', preview.housePoint, preview.houseRotation)
          if (houseError) {
            this.message = houseError
          } else {
            const house = s.buildings.find(building => building.id === before)!
            const plotId = s.nextId++
            s.residentialPlots.push({
              id: plotId,
              buildingId: house.id,
              roadId: preview.roadId,
              frontageA: { ...preview.frontageA },
              frontageB: { ...preview.frontageB },
              depth: preview.depth,
              side: preview.side,
              angle: preview.angle,
              backyard: backyardForPlot(plotId, preview.depth),
            })
            this.selectedId = house.id
            this.message = 'Residential plot planned · ' + preview.width.toFixed(1) + 'm frontage × ' + preview.depth.toFixed(1) + 'm depth.'
              + (preview.adjacentSnapped ? ' Frontage snapped flush to the neighboring plot.' : ' The house will face the road and keep the rear yard.')
          }
        }

        this.planningStart = null
        this.plotDraft = null
        this.rawPointer = null
        this.suppressClick = true
        setTimeout(() => { this.suppressClick = false }, 0)
        if (this.renderer.canvas.hasPointerCapture(e.pointerId)) this.renderer.canvas.releasePointerCapture(e.pointerId)
        this.updateGhost()
        this.updateHud()
        e.preventDefault()
        return
      }

      if (!this.dragStart || this.buildType !== 'wood-wall') return
      const end = this.renderer.worldPoint(e.clientX, e.clientY) ?? this.pointer ?? this.dragStart
      const points = wallLinePoints(this.dragStart, end)
      const horizontal = Math.abs(end.x - this.dragStart.x) >= Math.abs(end.z - this.dragStart.z)
      const rotation = horizontal ? 1 : 0
      const error = placeBuildingBatch(this.simulation.state, 'wood-wall', points, rotation)
      this.message = error ?? (points.length + ' wall blueprint' + (points.length === 1 ? '' : 's') + ' placed. Drag again or Esc to finish.')
      if (!error) this.selectedId = this.simulation.state.buildings.at(-1)?.id ?? null
      this.dragStart = null
      this.dragPoints = []
      this.suppressClick = true
      setTimeout(() => { this.suppressClick = false }, 0)
      if (this.renderer.canvas.hasPointerCapture(e.pointerId)) this.renderer.canvas.releasePointerCapture(e.pointerId)
      this.updateGhost()
      this.updateHud()
      e.preventDefault()
    }, { signal })
    this.renderer.canvas.addEventListener('contextmenu', e => {
      if (this.planningTool !== 'road') return
      e.preventDefault()
      this.undoRoadPoint()
      this.updateGhost()
      this.updateHud()
    }, { signal })

    this.renderer.canvas.addEventListener('click', e => {
      if (this.suppressClick) {
        this.suppressClick = false
        return
      }
      this.renderer.canvas.focus()
      const precise = this.renderer.worldPointPrecise(e.clientX, e.clientY)
      const p = precise ? { x: Math.round(precise.x), z: Math.round(precise.z) } : null
      if (!p || !precise) return
      const s = this.simulation.state
      if (this.planningTool === 'road') {
        const point = snapRoadPlacementPoint(s.roads, precise, this.gridSnap, this.roadJoinSnap)
        this.roadHover = point

        if (e.detail >= 2 && this.roadControls.length) {
          const last = this.roadControls[this.roadControls.length - 1]
          if (Math.hypot(point.x - last.x, point.z - last.z) > 0.35) this.roadControls.push(point)
          this.finishRoadDraft(false)
        } else {
          const last = this.roadControls[this.roadControls.length - 1]
          if (!last || Math.hypot(point.x - last.x, point.z - last.z) > 0.35) this.roadControls.push(point)
          this.roadDraft = sampleRoadCurve(this.roadControls, this.roadCurvature)
          this.message = this.roadControls.length === 1
            ? 'Road start placed. Move the cursor and click to add another point.'
            : this.roadControls.length + ' road points · click to continue · double-click or Enter to finish.'
        }

        this.updateGhost()
        this.updateHud()
        e.preventDefault()
        return
      }
      if (this.buildType) {
        const type = this.buildType
        const preview = buildingPlacementPreview(s.roads, precise, type, this.roadSnap, this.buildRotation)
        const beforeId = s.nextId
        const error = placeBuilding(s, type, preview.point, preview.rotation)
        this.message = error ?? (preview.snappedToRoad
          ? BUILDINGS[type].label + ' snapped to the road and faced toward it.'
          : e.shiftKey
            ? BUILDINGS[type].label + ' blueprint placed. Shift-place again or Esc to finish.'
            : BUILDINGS[type].label + ' blueprint placed. Settlers will supply and construct it during daylight.')
        if (!error) {
          const placed = s.buildings.find(b => b.id === beforeId)
            ?? [...s.buildings].reverse().find(b => b.x === preview.point.x && b.z === preview.point.z)
          if (placed && preview.snappedToRoad && preview.facingAngle !== null && !BUILDINGS[type].fortification) {
            placed.facingAngle = preview.facingAngle
          }
          this.selectedId = placed?.id ?? null
          if (!e.shiftKey) this.buildType = null
        }
      } else {
        const nearby = [...s.settlers, ...s.enemies, ...s.buildings, ...s.nodes.filter(n => n.remaining > 0)].filter(e => distance(e, p) < 1.8).sort((a, b) => distance(a, p) - distance(b, p))
        this.selectedId = nearby[0]?.id ?? null
      }
      this.updateGhost(); this.updateHud()
    }, { signal })
    window.addEventListener('keydown', e => {
      if ((e.target as HTMLElement).matches('input, select, textarea, button')) return
      if (e.key === '0') {
        e.preventDefault()
        this.action('road')
        return
      }
      if (e.key === '1') {
        e.preventDefault()
        this.action('residential-plot')
        return
      }
      if (this.planningTool === 'road') {
        if (e.key === 'Enter') {
          e.preventDefault()
          this.finishRoadDraft(true)
          this.updateGhost()
          this.updateHud()
          return
        }
        if (e.key === 'Backspace') {
          e.preventDefault()
          this.undoRoadPoint()
          this.updateGhost()
          this.updateHud()
          return
        }
        if (e.key.toLowerCase() === 'j') {
          e.preventDefault()
          this.action('road-join-snap')
          return
        }
        if (e.key.toLowerCase() === 'c') {
          e.preventDefault()
          this.action('road-curvature')
          return
        }
        if (e.key === ']') {
          e.preventDefault()
          this.action('road-width-next')
          return
        }
        if (e.key === '[') {
          e.preventDefault()
          this.action('road-width-prev')
          return
        }
      }
      const hotkeys: Record<string, BuildingId> = {
        '2': 'stockpile',
        '3': 'campfire',
        '4': 'brewery',
        '5': 'tavern',
        '6': 'guard-post',
        '7': 'wood-wall',
        '8': 'wood-gate',
        '9': 'blacksmith',
      }
      const hotkey = hotkeys[e.key]
      if (hotkey) {
        e.preventDefault()
        this.action(hotkey)
        return
      }
      if (e.key.toLowerCase() === 'g') {
        e.preventDefault()
        this.action('grid-snap')
        return
      }
      if (e.key.toLowerCase() === 'f') {
        e.preventDefault()
        this.action('road-snap')
        return
      }
      if (e.key.toLowerCase() === 'r' && this.buildType) {
        e.preventDefault()
        this.action('rotate-build')
      }
      if (e.key.toLowerCase() === 'v' && !this.buildType && !this.planningTool) {
        e.preventDefault()
        this.action('cinematic')
      }
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
    this.accumulator = 0; this.selectedId = null; this.buildType = null; this.planningTool = null; this.planningStart = null; this.roadControls = []; this.roadDraft = []; this.roadHover = null; this.plotDraft = null; this.dragStart = null; this.dragPoints = []; this.buildRotation = 0
  }
  private exportSave(): void {
    const blob = new Blob([serializeWorld(this.simulation.state)], { type: 'application/json' })
    const url = URL.createObjectURL(blob), link = document.createElement('a')
    link.href = url; link.download = 'nightspire-day-' + this.simulation.state.day + '.json'
    document.body.append(link); link.click(); link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  private roadWidthLabel(): string {
    if (this.roadWidth < 1.45) return 'Path'
    if (this.roadWidth < 2.05) return 'Road'
    return 'Main road'
  }

  private finishRoadDraft(includeHover: boolean): void {
    if (this.planningTool !== 'road') return
    const s = this.simulation.state
    const controls = [...this.roadControls]
    const last = controls[controls.length - 1]
    if (
      includeHover
      && this.roadHover
      && last
      && Math.hypot(this.roadHover.x - last.x, this.roadHover.z - last.z) > 0.35
    ) {
      controls.push(this.roadHover)
    }

    const points = sampleRoadCurve(controls, this.roadCurvature)
    const error = roadPlacementError(points)
    if (error) {
      this.message = error
      return
    }

    insertRoadJunctionPoint(s.roads, points[0])
    insertRoadJunctionPoint(s.roads, points[points.length - 1])
    s.roads.push({ id: s.nextId++, points, width: this.roadWidth })

    const length = points.slice(1).reduce(
      (sum, point, index) => sum + Math.hypot(point.x - points[index].x, point.z - points[index].z),
      0,
    )
    this.roadControls = []
    this.roadDraft = []
    this.roadHover = null
    this.message = this.roadWidthLabel() + ' placed · ' + length.toFixed(1)
      + 'm · road tool stays active. Click to start another road.'
  }

  private undoRoadPoint(): void {
    if (this.planningTool !== 'road') return
    if (this.roadControls.length === 0) {
      this.message = 'No road point to remove.'
      return
    }
    this.roadControls.pop()
    if (this.roadControls.length === 0) {
      this.roadDraft = []
      this.roadHover = null
      this.message = 'Road draft cleared. Click to place a new start point.'
      return
    }
    const controls = this.roadHover
      ? [...this.roadControls, this.roadHover]
      : [...this.roadControls]
    this.roadDraft = sampleRoadCurve(controls, this.roadCurvature)
    this.message = 'Removed last road point · ' + this.roadControls.length + ' committed point'
      + (this.roadControls.length === 1 ? '' : 's') + ' remain.'
  }
  private readonly action = (action: string, value?: string): void => {
    const s = this.simulation.state
    try {
      switch (action) {
        case 'road':
          this.buildType = null
          this.planningTool = 'road'
          this.planningStart = null
          this.roadDraft = []
          this.plotDraft = null
          this.dragStart = null
          this.dragPoints = []
          this.renderer.mode = 'settlement'
          this.message = this.gridSnap
            ? 'Road tool · Grid Snap ON: each drag creates a clean 0°/45°/90° segment. Press G for freeform.'
            : 'Road tool · Grid Snap OFF: click-drag a freeform road. Press G for aligned roads.'
          break
        case 'residential-plot':
          if (s.roads.length === 0) {
            this.message = 'Draw a road first. Residential plots need road frontage.'
            break
          }
          this.buildType = null
          this.planningTool = 'residential-plot'
          this.planningStart = null
          this.roadDraft = []
          this.plotDraft = null
          this.dragStart = null
          this.dragPoints = []
          this.renderer.mode = 'settlement'
          this.message = 'Residential Plot: start close to a road, then drag frontage + backyard depth. ' + (this.gridSnap ? 'Grid Snap rounds width/depth to 1m.' : 'Freeform dimensions enabled.')
          break
        case 'house': case 'stockpile': case 'guard-post': case 'wood-wall': case 'wood-gate': case 'campfire': case 'tavern': case 'brewery': case 'blacksmith':
          this.buildType = action
          this.planningTool = null
          this.planningStart = null
          this.roadDraft = []
          this.plotDraft = null
          this.buildRotation = 0
          this.dragStart = null
          this.dragPoints = []
          this.renderer.mode = 'settlement'
          this.message = action === 'wood-wall'
            ? 'Drag across the grid to plan a wall line. Esc cancels.'
            : 'Place ' + BUILDINGS[action].label + '. ' + (this.roadSnap && !BUILDINGS[action].fortification && action !== 'campfire'
              ? 'Road Snap ON: move near a road to magnetically align and face it. Press F to disable.'
              : 'Grid placement active; R rotates.')
          break
        case 'rotate-build':
          if (!this.buildType) { this.message = 'Choose a building first.'; break }
          this.buildRotation = (this.buildRotation + 1) % 4
          this.message = BUILDINGS[this.buildType].label + ' rotated to ' + ['South', 'East', 'North', 'West'][this.buildRotation] + '.'
          break
        case 'grid-snap':
          this.gridSnap = !this.gridSnap
          this.message = 'Grid Snap ' + (this.gridSnap ? 'ON · roads prefer 0°/45°/90° and plot dimensions snap to 1m.' : 'OFF · roads and plot dimensions are freeform.')
          if (this.planningStart) {
            this.planningStart = null
            this.roadDraft = []
            this.plotDraft = null
          }
          break
        case 'road-snap':
          this.roadSnap = !this.roadSnap
          this.message = 'Road Snap ' + (this.roadSnap ? 'ON · conventional buildings magnetically align and face nearby roads.' : 'OFF · conventional buildings use manual grid placement/rotation.')
          break
        case 'cancel':
          this.buildType = null
          this.planningTool = null
          this.planningStart = null
          this.roadDraft = []
          this.plotDraft = null
          this.dragStart = null
          this.dragPoints = []
          this.message = 'Inspect mode. Click a settler, raider, resource or building.'
          break
        case 'cancel-blueprint': {
          if (this.selectedId === null) { this.message = 'Select an unfinished blueprint first.'; break }
          const error = cancelBuilding(s, this.selectedId)
          if (error) this.message = error
          else { this.selectedId = null; this.message = 'Blueprint cancelled. Delivered and carried materials were returned safely.' }
          break
        }
        case 'demolish-selected': {
          if (this.selectedId === null) { this.message = 'Select a completed building first.'; break }
          const building = s.buildings.find(b => b.id === this.selectedId)
          if (!building) { this.message = 'Select a completed building first.'; break }
          const label = BUILDINGS[building.type].label
          const error = demolishBuilding(s, building.id)
          if (error) this.message = error
          else {
            this.selectedId = null
            this.message = label + ' demolished. Half of its build materials were returned when possible.'
          }
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
        case 'target-wood': case 'target-food': case 'target-ore': {
          const resource = action === 'target-wood' ? 'wood' : action === 'target-food' ? 'food' : 'ore'
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
        case 'immigration-test': {
          const result = forceImmigrationIfEligible(s)
          this.message = result.message
          break
        }
        case 'building-supply': {
          const building = s.buildings.find(b => b.id === this.selectedId && b.complete && !b.destroyed)
          if (!building) {
            this.message = 'Select a completed producer or supplied service building first.'
            break
          }
          const def = BUILDINGS[building.type]
          const resource = def.service?.supplyResource ?? def.production?.inputResource ?? null
          const capacity = def.service?.supplyResource
            ? def.service.supplyCapacity
            : def.production?.inputCapacity ?? 0
          if (!resource || capacity <= 0) {
            this.message = 'Select a completed producer or supplied service building first.'
            break
          }
          const amount = Math.min(5, Math.max(0, capacity - building.inventory[resource]))
          building.inventory[resource] += amount
          this.message = amount > 0
            ? 'QA added ' + amount + ' ' + resource + ' to ' + BUILDINGS[building.type].label + '.'
            : BUILDINGS[building.type].label + ' input storage is already full.'
          break
        }
        case 'paths': this.renderer.debug = value === 'true'; break
        case 'spawn': this.message = spawnSettler(s) ? 'QA settler spawned directly in camp.' : 'M3.3 maximum remains 10 settlers.'; break
        case 'resources': {
          let added = 0
          for (const resource of ['wood', 'food'] as const) {
            let remaining = 50
            for (const b of stockpiles(s)) {
              const amount = Math.min(remaining, freeStorage(s, b))
              b.inventory[resource] += amount; remaining -= amount; added += amount
            }
          }
          this.message = 'QA added ' + added + ' wood/food within unreserved storage capacity.'; break
        }
        case 'resources-ore': {
          let remaining = 30
          let added = 0
          for (const b of stockpiles(s)) {
            const amount = Math.min(remaining, freeStorage(s, b))
            b.inventory.ore += amount
            remaining -= amount
            added += amount
          }
          this.message = 'QA added ' + added + ' Iron Ore within unreserved storage capacity.'; break
        }
        case 'town-visual': {
          if (s.buildings.some(building => !(building.type === 'stockpile' && building.x === 0 && building.z === 0))) {
            this.message = 'Town Center visual target is available on a fresh settlement only.'
            break
          }
          const starter = s.buildings.find(building => building.type === 'stockpile' && building.x === 0 && building.z === 0)!
          starter.inventory.wood = 220
          starter.inventory.food = 120
          starter.inventory.ale = 8
          starter.inventory.ore = 18
          starter.inventory.tools = 3

          const plan: Array<[BuildingId, number, number, number]> = [
            ['house', -7, -3, 0],
            ['house', 7, -3, 0],
            ['house', 0, -8, 0],
            ['tavern', -5, 5, 1],
            ['blacksmith', 5, 5, 3],
            ['campfire', 0, 4, 0],
            ['guard-post', 0, 9, 2],
            ['wood-wall', -4, 12, 1],
            ['wood-wall', -3, 12, 1],
            ['wood-wall', -2, 12, 1],
            ['wood-wall', -1, 12, 1],
            ['wood-gate', 0, 12, 1],
            ['wood-wall', 1, 12, 1],
            ['wood-wall', 2, 12, 1],
            ['wood-wall', 3, 12, 1],
            ['wood-wall', 4, 12, 1],
          ]
          const built = plan.map(([type, x, z, rotation]) => createBuilding(s.nextId++, type, x, z, true, rotation))
          const tavern = built.find(building => building.type === 'tavern')!
          const smith = built.find(building => building.type === 'blacksmith')!
          tavern.inventory.ale = 12
          smith.inventory.ore = 12
          s.buildings.push(...built)

          const mainRoadId = s.nextId++
          const southRoadId = s.nextId++
          const lowerRoadId = s.nextId++
          s.roads.push(
            { id: mainRoadId, width: 1.7, points: [{ x: -11, z: 0 }, { x: -6, z: 0.2 }, { x: 0, z: 0 }, { x: 6, z: 0.15 }, { x: 11, z: 0 }] },
            { id: southRoadId, width: 1.7, points: [{ x: 0, z: 0 }, { x: 0.2, z: -2.5 }, { x: 0, z: -5 }] },
            { id: lowerRoadId, width: 1.65, points: [{ x: -4, z: -5 }, { x: 0, z: -5 }, { x: 4, z: -5 }] },
          )
          const houses = built.filter(building => building.type === 'house')
          const plotSpecs = [
            { buildingId: houses[0].id, roadId: mainRoadId, frontageA: { x: -9, z: 0 }, frontageB: { x: -5, z: 0 }, depth: 6, side: -1 as const, angle: 0 },
            { buildingId: houses[1].id, roadId: mainRoadId, frontageA: { x: 5, z: 0 }, frontageB: { x: 9, z: 0 }, depth: 6, side: -1 as const, angle: 0 },
            { buildingId: houses[2].id, roadId: lowerRoadId, frontageA: { x: -2.25, z: -5 }, frontageB: { x: 2.25, z: -5 }, depth: 6.5, side: -1 as const, angle: 0 },
          ]
          for (const spec of plotSpecs) {
            const plotId = s.nextId++
            s.residentialPlots.push({ id: plotId, ...spec, backyard: backyardForPlot(plotId, spec.depth) })
          }

          const clearSites = [{x:0,z:0}, ...built.map(building => ({x:building.x,z:building.z}))]
          for (const node of s.nodes) {
            if (clearSites.some(site => Math.hypot(site.x - node.x, site.z - node.z) < 3.1)) node.remaining = 0
          }
          s.topology++
          assignHousing(s)
          s.timeOfDay = 17.5 / 24
          this.renderer.mode = 'settlement'
          this.renderer.cinematic = true
          this.renderer.focus.x = 0
          this.renderer.focus.z = 2
          this.renderer.angle = 0.62
          this.renderer.zoom = 23
          this.selectedId = tavern.id
          this.message = 'M3.8.1 Town Center staged with player-road data and modular residential plots. Use 0 Road / 1 Residential Plot on a fresh run to test the actual tools.'
          break
        }
        case 'camera':
          this.buildType = null
          this.planningTool = null
          this.planningStart = null
          this.roadDraft = []
          this.plotDraft = null
          this.dragStart = null
          this.dragPoints = []
          this.renderer.mode = this.renderer.mode === 'settlement' ? 'follow' : 'settlement'
          if (this.renderer.mode === 'follow') this.renderer.cinematic = false
          break
        case 'cinematic':
          this.buildType = null
          this.planningTool = null
          this.planningStart = null
          this.roadDraft = []
          this.plotDraft = null
          this.dragStart = null
          this.dragPoints = []
          this.renderer.mode = 'settlement'
          this.renderer.cinematic = !this.renderer.cinematic
          if (this.renderer.cinematic) this.renderer.zoom = Math.min(this.renderer.zoom, 24)
          this.message = this.renderer.cinematic ? 'Street-oblique camera enabled. Pan and rotate normally; press V to return.' : 'Settlement overview camera restored.'
          break
        case 'center':
          this.renderer.mode = 'settlement'
          this.renderer.cinematic = false
          this.renderer.focus.x = 0
          this.renderer.focus.z = -1
          this.renderer.angle = 0
          this.renderer.zoom = 31
          break
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
          this.simulation.replace(imported); this.accumulator = 0; this.selectedId = null; this.buildType = null; this.planningTool = null; this.planningStart = null; this.roadDraft = []; this.plotDraft = null; this.dragStart = null; this.dragPoints = []; this.buildRotation = 0
          this.message = 'Imported and loaded save. The previous primary save is in the backup slot.'
          break
        }
        case 'import-error': throw new Error(value || 'Could not read the selected save file.')
        case 'audit': validateWorld(s); this.message = 'State integrity PASS: population attraction, needs, Ore/Tools production, services, raids, reservations and connectivity.'; break
      }
    } catch (error) { this.message = error instanceof Error ? error.message : 'Operation failed. Current settlement retained.' }
    this.updateGhost(); this.updateHud()
  }
  private updateGhost(): void {
    if (this.planningTool === 'road') {
      const points = this.planningStart ? this.roadDraft : []
      const error = points.length >= 2 ? roadPlacementError(points) : null
      this.renderer.showRoadGhost(points, !error, this.gridSnap)
      if (this.planningStart) {
        const length = points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - points[index].x, point.z - points[index].z), 0)
        this.message = error ?? ('Road preview · ' + length.toFixed(1) + 'm. Release to place.')
      }
      return
    }

    if (this.planningTool === 'residential-plot') {
      const preview = this.plotDraft
      let error = residentialPlotError(preview, this.simulation.state.residentialPlots)
      if (!error) error = residentialPlotBuildingError(preview, this.simulation.state.buildings)
      if (!error) error = residentialPlotResourceError(preview, this.simulation.state.nodes)
      if (!error && preview) error = placementError(this.simulation.state, 'house', preview.housePoint)
      this.renderer.showResidentialPlotGhost(preview, !error, this.gridSnap)
      if (this.planningStart) {
        this.message = error ?? (preview
          ? 'Residential plot preview · ' + preview.width.toFixed(1) + 'm frontage × ' + preview.depth.toFixed(1) + 'm depth.'
            + (preview.adjacentSnapped ? ' · Edge snapped to neighboring plot.' : '')
            + ' Release to plan.'
          : 'Start close to a player road and drag diagonally into the backyard.')
      }
      return
    }

    if (this.buildType === 'wood-wall' && this.dragStart && this.dragPoints.length) {
      const end = this.dragPoints.at(-1)!
      const horizontal = Math.abs(end.x - this.dragStart.x) >= Math.abs(end.z - this.dragStart.z)
      const rotation = horizontal ? 1 : 0
      const error = placementBatchError(this.simulation.state, 'wood-wall', this.dragPoints, rotation)
      this.renderer.showGhost('wood-wall', end, !error, rotation, this.dragPoints)
      this.message = error ?? ('Wall line: ' + this.dragPoints.length + ' segment' + (this.dragPoints.length === 1 ? '' : 's') + '. Release to place.')
      return
    }

    const placement = this.buildType && (this.rawPointer ?? this.pointer)
      ? buildingPlacementPreview(this.simulation.state.roads, this.rawPointer ?? this.pointer!, this.buildType, this.roadSnap, this.buildRotation)
      : null
    const error = this.buildType && placement ? placementError(this.simulation.state, this.buildType, placement.point) : null
    this.renderer.showGhost(this.buildType, placement?.point ?? this.pointer, !error, placement?.rotation ?? this.buildRotation, [], placement?.facingAngle ?? null)
    if (this.buildType && placement) {
      if (this.buildType === 'wood-gate' && !error) {
        const wall = this.simulation.state.buildings.find(b => b.type === 'wood-wall' && b.x === placement.point.x && b.z === placement.point.z)
        this.message = wall ? 'Valid gate insertion. Existing wall timber will be retained.' : 'Valid site. Click to place.'
      } else if (!error && placement.snappedToRoad) {
        this.message = 'Road Snap · ' + BUILDINGS[this.buildType].label + ' is magnetically aligned to the street. Press F to place manually.'
      } else {
        this.message = error ?? (this.buildType === 'wood-wall' ? 'Click or drag to place Wooden Walls.' : 'Valid grid site. Click to place · Shift keeps build mode · R rotates.')
      }
    }
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
    this.hud.update(this.simulation.state, {
      paused: this.paused,
      selectedId: this.selectedId,
      buildType: this.buildType,
      planningTool: this.planningTool,
      gridSnap: this.gridSnap,
      roadSnap: this.roadSnap,
      buildRotation: this.buildRotation,
      dragCount: this.dragPoints.length,
      message: this.message,
      camera: this.renderer.mode,
      cinematic: this.renderer.cinematic,
      metrics: this.metrics,
    })
  }
}
