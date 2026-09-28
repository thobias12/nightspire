import type { Landscape, MapSize } from '../data/map'
import { createGeneratedWorld, worldHalf } from '../world/MapGenerator'
import { FIXED_STEP } from '../data/jobs'
import { BUILDINGS, type BuildingId } from '../data/buildings'
import { RESOURCE_IDS, type ResourceId } from '../data/resources'
import { SceneRenderer } from '../render/SceneRenderer'
import {
  cancelBuilding,
  demolishBuilding,
  placeBuilding,
  placeBuildingBatch,
  placementBatchError,
  placementError,
  wallLinePoints,
} from '../systems/construction/Buildings'
import { distance } from '../world/Navigation'
import { BACKUP_KEY, deserializeWorld, SAVE_KEY, serializeWorld } from '../persistence/SaveLoad'
import { Simulation } from '../runtime/Simulation'
import {
  backyardForPlot,
  buildingPlacementPreview,
  buildingRequiresRoadFrontage,
  buildingRoadPlacementError,
  insertRoadJunctionPoint,
  roadLength,
  sampleRoadCurve,
  residentialPlotBuildingError,
  residentialPlotError,
  residentialPlotPreview,
  residentialPlotResourceError,
  roadPlacementError,
  snapPointToGrid,
  snapRoadControlPoint,
  type ResidentialPlotPreview,
} from '../world/TownPlanning'
import {
  createField, fieldArea, fieldPlacementError, nearestFarmhouseForField, pointInField, residentialPlotFieldError,
} from '../world/FieldPlanning'
import { createInitialWorldState, type Point } from '../model/WorldState'
import { assignWorkerToWorkplace, unassignWorkerFromWorkplace } from '../systems/population/Workforce'
import { nextStockpilePriority, stockpilePriorityLabel } from '../systems/economy/StockpileLogistics'
import { haulPriorityLabel, nextHaulPriority } from '../systems/economy/WorkplaceLogistics'
import { adjustTradeReserve, nextTradeMode, tradeModeLabel } from '../systems/economy/Trading'
import { Hud, type Metrics } from '../ui/Hud'
import { runQaAction } from '../qa/QaActions'
import { InputController } from './InputController'

export class Game {
  private readonly renderer = new SceneRenderer()
  private readonly simulation = new Simulation(createGeneratedWorld())
  private readonly hud: Hud
  private readonly input: InputController
  private readonly resizeObserver: ResizeObserver
  private readonly abort = new AbortController()
  private selectedId: number | null = null
  private buildType: BuildingId | null = null
  private buildRotation = 0
  private planningTool: 'road' | 'residential-plot' | 'field' | null = null
  private planningStart: Point | null = null
  private roadControlPoints: Point[] = []
  private roadDraft: Point[] = []
  private roadWidth = 1.7
  private roadCurve = 0.72
  private roadAngleSnap = false
  private plotDraft: ResidentialPlotPreview | null = null
  private fieldControlPoints: Point[] = []
  private fieldDraft: Point[] = []
  private fieldCloseReady = false
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
        this.roadAngleSnap = e.shiftKey
        this.refreshRoadDraft()
      } else if (this.planningTool === 'residential-plot' && this.planningStart && precise) {
        this.plotDraft = residentialPlotPreview(
          this.simulation.state.roads,
          this.planningStart,
          precise,
          2.2,
          this.gridSnap,
          this.simulation.state.residentialPlots,
        )
      } else if (this.planningTool === 'field' && precise) {
        const rawFieldPoint = this.gridSnap ? snapPointToGrid(precise) : precise
        const first = this.fieldControlPoints[0]
        this.fieldCloseReady = this.fieldControlPoints.length >= 3
          && !!first
          && Math.hypot(rawFieldPoint.x - first.x, rawFieldPoint.z - first.z) <= 0.9
        const previewPoint = this.fieldCloseReady && first ? first : rawFieldPoint
        this.pointer = previewPoint
        this.fieldDraft = [...this.fieldControlPoints]
        const last = this.fieldControlPoints.at(-1)
        if (!this.fieldCloseReady && (!last || Math.hypot(previewPoint.x - last.x, previewPoint.z - last.z) >= 0.15)) {
          this.fieldDraft.push(previewPoint)
        }
      } else if (this.dragStart && point && this.buildType === 'wood-wall') {
        this.dragPoints = wallLinePoints(this.dragStart, point)
      }
      this.updateGhost()
    }, { signal })
    this.renderer.canvas.addEventListener('pointerleave', () => {
      if (this.dragStart || this.planningStart) return
      this.pointer = null
      this.rawPointer = null
      this.updateGhost()
    }, { signal })
    this.renderer.canvas.addEventListener('pointerdown', e => {
      if (e.button !== 0) return

      if (this.planningTool) {
        const raw = this.renderer.worldPointPrecise(e.clientX, e.clientY)
        if (!raw) return
        this.renderer.canvas.focus()

        if (this.planningTool === 'road') {
          this.roadAngleSnap = e.shiftKey
          const anchor = this.roadControlPoints.at(-1) ?? null
          const point = snapRoadControlPoint(
            this.simulation.state.roads,
            raw,
            anchor,
            this.gridSnap,
            this.roadAngleSnap,
            this.roadSnap,
          )
          if (!anchor || Math.hypot(point.x - anchor.x, point.z - anchor.z) >= 0.35) {
            this.roadControlPoints.push(point)
            this.planningStart = this.roadControlPoints[0]
          }
          this.pointer = point
          this.rawPointer = raw
          this.roadDraft = sampleRoadCurve(this.roadControlPoints, this.roadCurve)
          this.plotDraft = null
          this.message = this.roadControlPoints.length === 1
            ? 'Road start placed. Move the mouse for a live preview; click to add points.'
            : 'Road point ' + this.roadControlPoints.length + ' placed. Continue, or double-click / Enter to finish.'
          this.updateGhost()
          this.updateHud()
          e.preventDefault()
          return
        }

        if (this.planningTool === 'field') {
          const point = this.gridSnap ? snapPointToGrid(raw) : raw
          const first = this.fieldControlPoints[0]
          if (
            this.fieldControlPoints.length >= 3
            && first
            && Math.hypot(point.x - first.x, point.z - first.z) <= 0.9
          ) {
            this.fieldCloseReady = true
            this.finalizeFieldDraft()
            e.preventDefault()
            return
          }

          const anchor = this.fieldControlPoints.at(-1)
          if (!anchor || Math.hypot(point.x - anchor.x, point.z - anchor.z) >= 0.75) {
            if (this.fieldControlPoints.length >= 8) {
              this.message = 'Field already has 8 corners. Click the first marker, press Enter, or double-click to finish.'
            } else {
              this.fieldControlPoints.push(point)
              this.planningStart = this.fieldControlPoints[0] ?? null
              this.fieldCloseReady = false
              this.message = this.fieldControlPoints.length < 3
                ? 'Field corner ' + this.fieldControlPoints.length + ' placed. Add at least ' + (3 - this.fieldControlPoints.length) + ' more.'
                : 'Field corner ' + this.fieldControlPoints.length + ' placed. Click the first marker to close, or keep shaping.'
            }
          }
          this.rawPointer = raw
          this.pointer = point
          this.fieldDraft = [...this.fieldControlPoints]
          this.updateGhost()
          this.updateHud()
          e.preventDefault()
          return
        }

        this.planningStart = raw
        this.pointer = raw
        this.rawPointer = raw
        this.roadDraft = []
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

        {
          const preview = residentialPlotPreview(s.roads, this.planningStart, rawEnd, 2.2, this.gridSnap, s.residentialPlots)
          let error = residentialPlotError(preview, s.residentialPlots, worldHalf(s))
          if (!error) error = residentialPlotBuildingError(preview, s.buildings)
          if (!error) error = residentialPlotResourceError(preview, s.nodes)
          if (!error) error = residentialPlotFieldError(preview, s.fields)
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
        }

        this.planningStart = null
        this.roadDraft = []
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
    this.renderer.canvas.addEventListener('dblclick', e => {
      if (this.planningTool !== 'road' && this.planningTool !== 'field') return
      e.preventDefault()
      if (this.planningTool === 'road') this.finalizeRoadDraft()
      else this.finalizeFieldDraft()
    }, { signal })
    this.renderer.canvas.addEventListener('contextmenu', e => {
      if (this.planningTool !== 'road' && this.planningTool !== 'field') return
      e.preventDefault()
      if (this.planningTool === 'field') {
        if (this.fieldControlPoints.length > 0) {
          this.fieldControlPoints.pop()
          this.planningStart = this.fieldControlPoints[0] ?? null
          this.fieldDraft = [...this.fieldControlPoints]
          this.message = this.fieldControlPoints.length ? 'Removed last field corner.' : 'Field draft cleared.'
          this.updateGhost()
          this.updateHud()
        } else {
          this.action('cancel')
        }
        return
      }
      if (this.roadControlPoints.length > 0) {
        this.planningStart = null
        this.roadControlPoints = []
        this.roadDraft = []
        this.rawPointer = null
        this.pointer = null
        this.message = 'Road draft cancelled. Click to start a new road; Esc exits the road tool.'
        this.updateGhost()
        this.updateHud()
      } else {
        this.action('cancel')
      }
    }, { signal })
    this.renderer.canvas.addEventListener('click', e => {
      if (this.planningTool) return
      if (this.suppressClick) {
        this.suppressClick = false
        return
      }
      this.renderer.canvas.focus()
      const precise = this.renderer.worldPointPrecise(e.clientX, e.clientY)
      const p = precise ? { x: Math.round(precise.x), z: Math.round(precise.z) } : null
      if (!p || !precise) return
      const s = this.simulation.state
      if (this.buildType) {
        const type = this.buildType
        const preview = buildingPlacementPreview(
          s.roads,
          precise,
          type,
          buildingRequiresRoadFrontage(type) ? true : this.roadSnap,
          this.buildRotation,
        )
        const beforeId = s.nextId
        const roadError = buildingRoadPlacementError(s.roads, preview.point, type)
        const error = roadError ?? placeBuilding(s, type, preview.point, preview.rotation)
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
        const field = s.fields.find(candidate => pointInField(precise, candidate))
        this.selectedId = nearby[0]?.id ?? field?.id ?? null
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
      if (e.key.toLowerCase() === 'm') {
        e.preventDefault()
        this.action('market')
        return
      }
      if (e.key.toLowerCase() === 't') {
        e.preventDefault()
        this.action('trading-post')
        return
      }
      if (e.key.toLowerCase() === 'a') {
        e.preventDefault()
        this.action('farmhouse')
        return
      }
      if (e.key.toLowerCase() === 'p') {
        e.preventDefault()
        this.action('field')
        return
      }
      if (this.planningTool === 'road' && e.key === 'Shift') {
        if (!this.roadAngleSnap) {
          this.roadAngleSnap = true
          this.refreshRoadDraft()
          this.updateGhost()
          this.updateHud()
        }
        return
      }
      if (this.planningTool === 'road' && e.key === 'Backspace') {
        e.preventDefault()
        this.undoRoadControlPoint()
        return
      }
      if (this.planningTool === 'field' && e.key === 'Backspace') {
        e.preventDefault()
        if (this.fieldControlPoints.length > 0) {
          this.fieldControlPoints.pop()
          this.planningStart = this.fieldControlPoints[0] ?? null
          this.fieldDraft = [...this.fieldControlPoints]
          this.message = this.fieldControlPoints.length ? 'Removed last field corner.' : 'Field draft cleared.'
          this.updateGhost(); this.updateHud()
        }
        return
      }
      if (this.planningTool === 'road' && e.key === 'Enter') {
        e.preventDefault()
        this.finalizeRoadDraft()
        return
      }
      if (this.planningTool === 'field' && e.key === 'Enter') {
        e.preventDefault()
        this.finalizeFieldDraft()
        return
      }
      if (this.planningTool === 'road' && e.key === '[') {
        e.preventDefault()
        this.adjustRoadWidth(-1)
        return
      }
      if (this.planningTool === 'road' && e.key === ']') {
        e.preventDefault()
        this.adjustRoadWidth(1)
        return
      }
      if (this.planningTool === 'road' && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        this.action('road-curve')
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
    window.addEventListener('keyup', e => {
      if (e.key !== 'Shift' || !this.roadAngleSnap) return
      this.roadAngleSnap = false
      if (this.planningTool === 'road') {
        this.refreshRoadDraft()
        this.updateGhost()
        this.updateHud()
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
    this.renderer.focus.x = 0; this.renderer.focus.z = -1
    this.renderer.zoom = this.simulation.state.map ? 55 : 31
    this.accumulator = 0; this.selectedId = null; this.buildType = null; this.planningTool = null; this.planningStart = null; this.roadControlPoints = []; this.roadDraft = []; this.fieldControlPoints = []; this.fieldDraft = []; this.roadAngleSnap = false; this.plotDraft = null; this.dragStart = null; this.dragPoints = []; this.buildRotation = 0
  }
  private roadCurveLabel(): string {
    if (this.roadCurve <= 0.05) return 'Straight'
    return this.roadCurve < 0.8 ? 'Smooth' : 'Curved'
  }

  private refreshRoadDraft(): void {
    if (this.planningTool !== 'road') return
    if (this.roadControlPoints.length === 0) {
      this.roadDraft = []
      return
    }

    const controls = [...this.roadControlPoints]
    const anchor = controls[controls.length - 1]
    if (this.rawPointer) {
      const end = snapRoadControlPoint(
        this.simulation.state.roads,
        this.rawPointer,
        anchor,
        this.gridSnap,
        this.roadAngleSnap,
        this.roadSnap,
      )
      if (Math.hypot(end.x - anchor.x, end.z - anchor.z) >= 0.08) controls.push(end)
    }
    this.roadDraft = sampleRoadCurve(controls, this.roadCurve)
  }

  private undoRoadControlPoint(): void {
    if (this.planningTool !== 'road' || this.roadControlPoints.length === 0) return
    this.roadControlPoints.pop()
    this.planningStart = this.roadControlPoints[0] ?? null
    this.refreshRoadDraft()
    this.message = this.roadControlPoints.length
      ? 'Removed last road point. Continue shaping or finish with Enter.'
      : 'Road draft cleared. Click to place a new start point.'
    this.updateGhost()
    this.updateHud()
  }

  private adjustRoadWidth(direction: -1 | 1): void {
    const widths = [1.2, 1.7, 2.4]
    let index = widths.findIndex(width => Math.abs(width - this.roadWidth) < 0.05)
    if (index < 0) index = 1
    index = Math.max(0, Math.min(widths.length - 1, index + direction))
    this.roadWidth = widths[index]
    this.message = 'Road width · ' + (this.roadWidth <= 1.25 ? 'Path' : this.roadWidth >= 2.35 ? 'Main road' : 'Lane') + ' · ' + this.roadWidth.toFixed(1) + 'm.'
    this.updateGhost()
    this.updateHud()
  }

  private finalizeRoadDraft(): void {
    if (this.planningTool !== 'road') return
    const points = sampleRoadCurve(this.roadControlPoints, this.roadCurve)
    const error = roadPlacementError(points, this.simulation.state.fields, worldHalf(this.simulation.state))
    if (error) {
      this.message = error
      this.updateGhost()
      this.updateHud()
      return
    }

    const s = this.simulation.state
    for (const control of this.roadControlPoints) insertRoadJunctionPoint(s.roads, control)
    s.roads.push({ id: s.nextId++, points, width: this.roadWidth })
    this.message = 'Road placed · ' + roadLength(points).toFixed(1) + 'm · ' + this.roadCurveLabel()
      + ' · ' + this.roadWidth.toFixed(1) + 'm. Click to start another road.'
    this.planningStart = null
    this.roadControlPoints = []
    this.roadDraft = []
    this.rawPointer = null
    this.pointer = null
    this.updateGhost()
    this.updateHud()
  }

  private finalizeFieldDraft(): void {
    if (this.planningTool !== 'field') return
    const s = this.simulation.state
    const points = this.fieldControlPoints.map(point => ({ ...point }))
    const error = fieldPlacementError(points, s.fields, s.buildings, s.residentialPlots, s.nodes, s.roads, worldHalf(s))
    if (error) {
      this.message = error
      this.updateGhost()
      this.updateHud()
      return
    }
    const farmhouse = nearestFarmhouseForField(points, s.buildings)
    if (!farmhouse) {
      this.message = 'Field needs a Farmhouse within 18m.'
      this.updateGhost()
      this.updateHud()
      return
    }
    const field = createField(s.nextId++, points, farmhouse.id)
    s.fields.push(field)
    this.selectedId = field.id
    this.message = 'Field linked to Farmhouse ' + farmhouse.id + ' · ' + field.area.toFixed(1) + 'm² · expected harvest ' + field.yield + ' Food. Click to start another field.'
    this.planningStart = null
    this.fieldControlPoints = []
    this.fieldDraft = []
    this.fieldCloseReady = false
    this.rawPointer = null
    this.pointer = null
    this.updateGhost()
    this.updateHud()
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
      const qa = runQaAction(action, value, {
        state: s,
        selectedId: this.selectedId,
        simulation: this.simulation,
        renderer: this.renderer,
      })
      if (qa.handled) {
        if ('selectedId' in qa) this.selectedId = qa.selectedId ?? null
        if (qa.message !== undefined) this.message = qa.message
        this.updateGhost()
        this.updateHud()
        return
      }

      switch (action) {
        case 'road':
          this.buildType = null
          this.planningTool = 'road'
          this.planningStart = null
          this.roadControlPoints = []
          this.roadDraft = []
          this.fieldControlPoints = []
          this.fieldDraft = []
          this.plotDraft = null
          this.dragStart = null
          this.dragPoints = []
          this.renderer.mode = 'settlement'
          this.roadAngleSnap = false
          this.message = 'Road tool · LMB adds points · move for live preview · double-click/Enter finishes · RMB cancels draft · Esc exits · Shift constrains angle · G grid · F road snap · C curve · [ / ] width.'
          break
        case 'road-curve':
          this.roadCurve = this.roadCurve < 0.2 ? 0.58 : this.roadCurve < 0.8 ? 0.92 : 0
          this.message = 'Road curvature · ' + this.roadCurveLabel() + '. Grid Snap only controls point positions; hold Shift for 0°/45°/90° segments.'
          this.refreshRoadDraft()
          break
        case 'road-width':
          this.roadWidth = this.roadWidth <= 1.25 ? 1.7 : this.roadWidth < 2.35 ? 2.4 : 1.2
          this.message = 'Road width · ' + (this.roadWidth <= 1.25 ? 'Path' : this.roadWidth >= 2.35 ? 'Main road' : 'Lane') + ' · ' + this.roadWidth.toFixed(1) + 'm.'
          break
        case 'field':
          if (!s.buildings.some(building => building.type === 'farmhouse' && !building.destroyed)) {
            this.message = 'Build a road-fronted Farmhouse before planning fields.'
            break
          }
          this.buildType = null
          this.planningTool = 'field'
          this.planningStart = null
          this.roadControlPoints = []
          this.roadDraft = []
          this.fieldControlPoints = []
          this.fieldDraft = []
          this.fieldCloseReady = false
          this.plotDraft = null
          this.dragStart = null
          this.dragPoints = []
          this.renderer.mode = 'settlement'
          this.message = 'Field tool · shared Grid Snap is ' + (this.gridSnap ? 'ON' : 'OFF') + ' · click 3–8 corners within 18m of a Farmhouse · click the first marker to close · G toggles the same 1m grid used by roads.'
          break
        case 'residential-plot':
          if (s.roads.length === 0) {
            this.message = 'Draw a road first. Residential plots need road frontage.'
            break
          }
          this.buildType = null
          this.planningTool = 'residential-plot'
          this.planningStart = null
          this.roadControlPoints = []
          this.roadDraft = []
          this.fieldControlPoints = []
          this.fieldDraft = []
          this.plotDraft = null
          this.dragStart = null
          this.dragPoints = []
          this.renderer.mode = 'settlement'
          this.message = 'Residential Plot: start close to a road, then drag frontage + backyard depth. ' + (this.gridSnap ? 'Grid Snap rounds width/depth to 1m.' : 'Freeform dimensions enabled.')
          break
        case 'house': case 'stockpile': case 'guard-post': case 'wood-wall': case 'wood-gate': case 'campfire': case 'tavern': case 'brewery': case 'blacksmith': case 'market': case 'trading-post': case 'farmhouse': case 'foresters-lodge': case 'mine': case 'ore-yard': case 'fishing-hut': case 'pleasure-house':
          this.buildType = action
          this.planningTool = null
          this.planningStart = null
          this.roadControlPoints = []
          this.roadDraft = []
          this.fieldControlPoints = []
          this.fieldDraft = []
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
          this.message = 'Grid Snap ' + (this.gridSnap
            ? 'ON · roads, residential dimensions and field corners use the shared 1m grid.'
            : 'OFF · roads, residential dimensions and field corners can be freeform.')
          if (this.planningTool === 'road') {
            this.refreshRoadDraft()
          } else if (this.planningTool === 'field') {
            this.fieldDraft = [...this.fieldControlPoints]
          } else if (this.planningStart && this.planningTool === 'residential-plot') {
            this.planningStart = null
            this.plotDraft = null
          }
          break
        case 'road-snap':
          this.roadSnap = !this.roadSnap
          this.message = 'Road Join Snap ' + (this.roadSnap
            ? 'ON · road control points join nearby endpoints and centerlines. Building frontage remains mandatory.'
            : 'OFF · road control points stay where placed. Building frontage remains mandatory.')
          this.refreshRoadDraft()
          break
        case 'select-object': {
          const id = Number(value)
          if (!Number.isSafeInteger(id)) { this.message = 'That object is no longer available.'; break }
          const exists = [...s.settlers, ...s.enemies, ...s.buildings, ...s.nodes, ...s.fields].some(candidate => candidate.id === id)
          if (!exists) { this.message = 'That object is no longer available.'; break }
          this.selectedId = id
          this.buildType = null
          this.planningTool = null
          this.message = ''
          break
        }
        case 'close-inspector':
          if (this.selectedId !== null) {
            this.selectedId = null
            this.message = ''
            break
          }
          this.buildType = null
          this.planningTool = null
          this.planningStart = null
          this.roadControlPoints = []
          this.roadDraft = []
          this.fieldControlPoints = []
          this.fieldDraft = []
          this.fieldCloseReady = false
          this.roadAngleSnap = false
          this.plotDraft = null
          this.dragStart = null
          this.dragPoints = []
          this.message = ''
          break
        case 'close-selection':
          this.selectedId = null
          this.message = ''
          break
        case 'cancel':
          this.buildType = null
          this.planningTool = null
          this.planningStart = null
          this.roadControlPoints = []
          this.roadDraft = []
          this.fieldControlPoints = []
          this.fieldDraft = []
          this.fieldCloseReady = false
          this.roadAngleSnap = false
          this.plotDraft = null
          this.dragStart = null
          this.dragPoints = []
          this.message = 'Inspect mode. Click a settler, raider, resource or building.'
          break
        case 'remove-field': {
          if (this.selectedId === null) { this.message = 'Select a farm field first.'; break }
          const index = s.fields.findIndex(field => field.id === this.selectedId)
          if (index < 0) { this.message = 'Select a farm field first.'; break }
          const [field] = s.fields.splice(index, 1)
          this.selectedId = null
          this.message = 'Farm Field ' + field.id + ' removed. Fields have no construction refund.'
          break
        }
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
        case 'assign-workplace': {
          if (this.selectedId === null) { this.message = 'Select a completed workplace first.'; break }
          const result = assignWorkerToWorkplace(s, this.selectedId)
          this.message = result.message
          break
        }
        case 'unassign-workplace': {
          const settlerId = Number(value)
          if (!Number.isSafeInteger(settlerId)) { this.message = 'Select an assigned worker first.'; break }
          const result = unassignWorkerFromWorkplace(s, settlerId)
          this.message = result.message
          break
        }
        case 'workplace-haul-priority': {
          const building = s.buildings.find(candidate => candidate.id === this.selectedId && candidate.complete && !candidate.destroyed)
          if (!building || !BUILDINGS[building.type].production) { this.message = 'Select a completed production workplace first.'; break }
          building.haulPriority = nextHaulPriority(building.haulPriority)
          this.message = BUILDINGS[building.type].label + ' hauling priority set to ' + haulPriorityLabel(building.haulPriority)
            + '. This changes its local input reserve and finished-goods pickup threshold.'
          break
        }
        case 'stockpile-priority': {
          const building = s.buildings.find(candidate => candidate.id === this.selectedId && candidate.complete && !candidate.destroyed)
          if (!building || BUILDINGS[building.type].storage <= 0) { this.message = 'Select a completed stockpile first.'; break }
          building.stockpilePriority = nextStockpilePriority(building.stockpilePriority)
          this.message = BUILDINGS[building.type].label + ' receiving priority set to ' + stockpilePriorityLabel(building.stockpilePriority)
            + '. Priority is chosen before distance when Laborers select a destination.'
          break
        }
        case 'stockpile-filter': {
          const building = s.buildings.find(candidate => candidate.id === this.selectedId && candidate.complete && !candidate.destroyed)
          const resource = value as ResourceId | undefined
          if (!building || BUILDINGS[building.type].storage <= 0 || !resource || !RESOURCE_IDS.includes(resource)) {
            this.message = 'Select a stockpile and a valid resource filter first.'
            break
          }
          building.stockpileFilters[resource] = !building.stockpileFilters[resource]
          this.message = BUILDINGS[building.type].label + ' now ' + (building.stockpileFilters[resource] ? 'accepts ' : 'rejects ') + resource
            + '. Existing stock and already-carried deliveries are not discarded.'
          break
        }
        case 'trade-policy': {
          const building = s.buildings.find(candidate => candidate.id === this.selectedId && candidate.type === 'trading-post' && candidate.complete && !candidate.destroyed)
          const resource = value as ResourceId | undefined
          if (!building || !resource || !RESOURCE_IDS.includes(resource)) {
            this.message = 'Select the completed Trading Post and a valid resource first.'
            break
          }
          const policy = s.trade.policies[resource]
          policy.mode = nextTradeMode(policy.mode)
          this.message = resource + ' trade policy: ' + tradeModeLabel(policy.mode) + ' at reserve ' + policy.reserve + '.'
          break
        }
        case 'trade-reserve-up':
        case 'trade-reserve-down': {
          const building = s.buildings.find(candidate => candidate.id === this.selectedId && candidate.type === 'trading-post' && candidate.complete && !candidate.destroyed)
          const resource = value as ResourceId | undefined
          if (!building || !resource || !RESOURCE_IDS.includes(resource)) {
            this.message = 'Select the completed Trading Post and a valid resource first.'
            break
          }
          const reserve = adjustTradeReserve(s, resource, action === 'trade-reserve-up' ? 5 : -5)
          this.message = resource + ' trade reserve set to ' + reserve + '. Exports only use surplus above it; imports buy toward it.'
          break
        }
        case 'toggle-role': {
          const settler = s.settlers.find(a => a.id === this.selectedId)
          if (!settler) { this.message = 'Select a settler first.'; break }
          if (settler.role !== 'guard' && settler.workplaceId !== null) settler.workplaceId = null
          settler.role = settler.role === 'guard' ? 'worker' : 'guard'
          settler.path = []; settler.pathRevision = -1
          this.message = settler.role === 'guard'
            ? 'Assigned as guard. Any workplace assignment was cleared; during dusk/night they will report to an available Guard Post.'
            : 'Returned to the general labor pool.'
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
        case 'target-wood': case 'target-food': case 'target-ore': {
          const resource = action === 'target-wood' ? 'wood' : action === 'target-food' ? 'food' : 'ore'
          const target = Math.max(0, Math.min(10_000, Math.round(Number(value))))
          if (!Number.isFinite(target)) throw new Error('Stock target must be a number.')
          s.targets[resource] = target
          this.message = resource[0].toUpperCase() + resource.slice(1) + ' stock target set to ' + target + '.'
          break
        }
        case 'camera':
          this.buildType = null
          this.planningTool = null
          this.planningStart = null
          this.roadControlPoints = []
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
          this.roadControlPoints = []
          this.roadDraft = []
          this.plotDraft = null
          this.dragStart = null
          this.dragPoints = []
          this.renderer.mode = 'settlement'
          this.renderer.cinematic = !this.renderer.cinematic
          if (this.renderer.cinematic) this.renderer.zoom = Math.min(this.renderer.zoom, 24)
          this.message = this.renderer.cinematic ? 'Street-oblique camera enabled. Pan and rotate normally; press V to return.' : 'Settlement overview camera restored.'
          break
        case 'new-region': {
          const settings = JSON.parse(value ?? '{}') as { seed: number; size: MapSize; landscape: Landscape }
          const next = createGeneratedWorld(settings.seed, settings.size, settings.landscape)
          const text = serializeWorld(next)
          this.storePrimary(serializeWorld(s))
          this.replaceWorld(text)
          this.renderer.focus.x = 0; this.renderer.focus.z = -1
          this.renderer.zoom = 55; this.renderer.mode = 'settlement'; this.renderer.cinematic = false
          this.message = 'Created ' + settings.size + 'm region, seed ' + settings.seed + '. Previous settlement saved: Load restores it.'
          break
        }
        case 'region-view':
          this.renderer.mode = 'settlement'; this.renderer.cinematic = false
          this.renderer.focus.x = 0; this.renderer.focus.z = 0; this.renderer.zoom = (s.map?.size ?? 47) * 1.18
          break
        case 'map-focus': {
          const [x, z] = (value ?? '').split(',').map(Number), half = worldHalf(s)
          if (Number.isFinite(x) && Number.isFinite(z)) {
            this.renderer.mode = 'settlement'; this.renderer.focus.x = Math.max(-half, Math.min(half, x * half))
            this.renderer.focus.z = Math.max(-half, Math.min(half, z * half)); this.renderer.zoom = 55
            this.message = 'Viewing region at ' + Math.round(this.renderer.focus.x) + ', ' + Math.round(this.renderer.focus.z) + 'm.'
          }
          break
        }
        case 'center':
          this.renderer.mode = 'settlement'
          this.renderer.cinematic = false
          this.renderer.focus.x = 0
          this.renderer.focus.z = -1
          this.renderer.angle = 0
          this.renderer.zoom = s.map ? 55 : 31
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
          this.simulation.replace(imported); this.accumulator = 0; this.selectedId = null; this.buildType = null; this.planningTool = null; this.planningStart = null; this.roadControlPoints = []; this.roadDraft = []; this.fieldControlPoints = []; this.fieldDraft = []; this.plotDraft = null; this.dragStart = null; this.dragPoints = []; this.buildRotation = 0
          this.message = 'Imported and loaded save. The previous primary save is in the backup slot.'
          break
        }
        case 'import-error': throw new Error(value || 'Could not read the selected save file.')
      }
    } catch (error) { this.message = error instanceof Error ? error.message : 'Operation failed. Current settlement retained.' }
    this.updateGhost(); this.updateHud()
  }
  private updateGhost(): void {
    if (this.planningTool === 'field') {
      const points = this.fieldControlPoints.length ? this.fieldDraft : []
      const s = this.simulation.state
      const error = points.length >= 3
        ? fieldPlacementError(points, s.fields, s.buildings, s.residentialPlots, s.nodes, s.roads, worldHalf(s))
        : null
      this.renderer.showFieldGhost(points, !error, this.gridSnap)
      if (this.fieldControlPoints.length > 0) {
        const area = points.length >= 3 ? fieldArea(points) : 0
        const projectedYield = area > 0 ? Math.max(8, Math.min(60, Math.round(area * 0.55))) : 0
        this.message = error ?? (
          'Field preview · ' + (area > 0 ? area.toFixed(1) + 'm² · about ' + projectedYield + ' Food · ' : '')
          + this.fieldControlPoints.length + ' fixed corner' + (this.fieldControlPoints.length === 1 ? '' : 's')
          + (this.fieldCloseReady
            ? ' · click to close this parcel.'
            : ' · continue shaping or return to the first marker to close.')
        )
      }
      return
    }

    if (this.planningTool === 'road') {
      const points = this.roadControlPoints.length ? this.roadDraft : []
      const error = points.length >= 2 ? roadPlacementError(points, this.simulation.state.fields, worldHalf(this.simulation.state)) : null
      this.renderer.showRoadGhost(points, !error, this.gridSnap, this.roadWidth)
      if (this.roadControlPoints.length > 0 && this.rawPointer) {
        this.message = error ?? (
          'Road preview · ' + roadLength(points).toFixed(1) + 'm · '
          + this.roadCurveLabel() + ' · ' + this.roadWidth.toFixed(1)
          + 'm · ' + (this.roadAngleSnap ? 'Shift angle constrain ON · ' : '')
          + (this.gridSnap ? 'Grid ON · ' : 'Grid OFF · ')
          + (this.roadSnap ? 'Road Snap ON · ' : 'Road Snap OFF · ')
          + 'click point ' + (this.roadControlPoints.length + 1) + ', double-click / Enter to finish.'
        )
      }
      return
    }

    if (this.planningTool === 'residential-plot') {
      const preview = this.plotDraft
      let error = residentialPlotError(preview, this.simulation.state.residentialPlots, worldHalf(this.simulation.state))
      if (!error) error = residentialPlotBuildingError(preview, this.simulation.state.buildings)
      if (!error) error = residentialPlotResourceError(preview, this.simulation.state.nodes)
      if (!error) error = residentialPlotFieldError(preview, this.simulation.state.fields)
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
      ? buildingPlacementPreview(
          this.simulation.state.roads,
          this.rawPointer ?? this.pointer!,
          this.buildType,
          buildingRequiresRoadFrontage(this.buildType) ? true : this.roadSnap,
          this.buildRotation,
        )
      : null
    const error = this.buildType && placement
      ? placementError(this.simulation.state, this.buildType, placement.point)
        ?? buildingRoadPlacementError(this.simulation.state.roads, placement.point, this.buildType)
      : null
    this.renderer.showGhost(this.buildType, placement?.point ?? this.pointer, !error, placement?.rotation ?? this.buildRotation, [], placement?.facingAngle ?? null)
    if (this.buildType && placement) {
      if (this.buildType === 'wood-gate' && !error) {
        const wall = this.simulation.state.buildings.find(b => b.type === 'wood-wall' && b.x === placement.point.x && b.z === placement.point.z)
        this.message = wall ? 'Valid gate insertion. Existing wall timber will be retained.' : 'Valid site. Click to place.'
      } else if (!error && placement.snappedToRoad) {
        this.message = 'Road frontage · ' + BUILDINGS[this.buildType].label + ' is aligned to the street. Conventional buildings must stay road-connected.'
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
    const state = this.simulation.state
    const selectedBuilding = state.buildings.find(candidate => candidate.id === this.selectedId)
    const selectedWorldObject = selectedBuilding
      ?? state.settlers.find(candidate => candidate.id === this.selectedId)
      ?? state.enemies.find(candidate => candidate.id === this.selectedId)
      ?? state.nodes.find(candidate => candidate.id === this.selectedId)
      ?? state.fields.find(candidate => candidate.id === this.selectedId)
      ?? null
    const selectionAnchor = selectedWorldObject
      ? this.renderer.screenPoint(selectedWorldObject, selectedBuilding ? Math.max(1.6, BUILDINGS[selectedBuilding.type].fortification ? 1.35 : 2.0) : 1.15)
      : null

    this.hud.update(state, {
      paused: this.paused,
      selectedId: this.selectedId,
      buildType: this.buildType,
      planningTool: this.planningTool,
      gridSnap: this.gridSnap,
      roadSnap: this.roadSnap,
      roadWidth: this.roadWidth,
      roadCurve: this.roadCurve,
      roadAngleSnap: this.roadAngleSnap,
      roadPointCount: this.roadControlPoints.length,
      fieldPointCount: this.fieldControlPoints.length,
      buildRotation: this.buildRotation,
      dragCount: this.dragPoints.length,
      message: this.message,
      camera: this.renderer.mode,
      cameraPoint: this.renderer.focus,
      cinematic: this.renderer.cinematic,
      selectionAnchor,
      metrics: this.metrics,
    })
  }
}
