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
  snapRoadControlPoint
} from '../world/TownPlanning'
import {
  createField, fieldArea, fieldPlacementError, nearestFarmhouseForField, pointInField, residentialPlotFieldError,
} from '../world/FieldPlanning'
import { createInitialWorldState } from '../model/WorldState'
import { assignWorkerToWorkplace, unassignWorkerFromWorkplace } from '../systems/population/Workforce'
import { nextStockpilePriority, stockpilePriorityLabel } from '../systems/economy/StockpileLogistics'
import { haulPriorityLabel, nextHaulPriority } from '../systems/economy/WorkplaceLogistics'
import { adjustTradeReserve, nextTradeMode, tradeModeLabel } from '../systems/economy/Trading'
import { Hud, type Metrics } from '../ui/Hud'
import { runQaAction } from '../qa/QaActions'
import { InputController } from './InputController'
import { clearPlanningDrafts, createPlanningState, resetPlanningForImport } from './PlanningState'
import {
  adjustRoadWidth as changeRoadWidth,
  finalizeFieldDraft as commitFieldDraft,
  finalizeRoadDraft as commitRoadDraft,
  refreshRoadDraft as rebuildRoadDraft,
  roadCurveLabel,
  undoRoadControlPoint as removeRoadControlPoint,
} from './PlanningOperations'
import { updatePlanningGhost } from './PlanningPresentation'

export class Game {
  private readonly renderer = new SceneRenderer()
  private readonly simulation = new Simulation(createGeneratedWorld())
  private readonly hud: Hud
  private readonly input: InputController
  private readonly resizeObserver: ResizeObserver
  private readonly abort = new AbortController()
  private selectedId: number | null = null
  private readonly planning = createPlanningState()
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
      this.planning.rawPointer = precise
      const point = this.planning.tool ? precise : (precise ? { x: Math.round(precise.x), z: Math.round(precise.z) } : null)
      if (
        !this.planning.tool
        && point?.x === this.planning.pointer?.x
        && point?.z === this.planning.pointer?.z
        && !(this.planning.dragStart && this.planning.buildType === 'wood-wall')
        && !(this.planning.buildType && this.planning.roadSnap)
      ) return
      this.planning.pointer = point

      if (this.planning.tool === 'road' && precise) {
        this.planning.roadAngleSnap = e.shiftKey
        this.refreshRoadDraft()
      } else if (this.planning.tool === 'residential-plot' && this.planning.start && precise) {
        this.planning.plotDraft = residentialPlotPreview(
          this.simulation.state.roads,
          this.planning.start,
          precise,
          2.2,
          this.planning.gridSnap,
          this.simulation.state.residentialPlots,
        )
      } else if (this.planning.tool === 'field' && precise) {
        const rawFieldPoint = this.planning.gridSnap ? snapPointToGrid(precise) : precise
        const first = this.planning.fieldControlPoints[0]
        this.planning.fieldCloseReady = this.planning.fieldControlPoints.length >= 3
          && !!first
          && Math.hypot(rawFieldPoint.x - first.x, rawFieldPoint.z - first.z) <= 0.9
        const previewPoint = this.planning.fieldCloseReady && first ? first : rawFieldPoint
        this.planning.pointer = previewPoint
        this.planning.fieldDraft = [...this.planning.fieldControlPoints]
        const last = this.planning.fieldControlPoints.at(-1)
        if (!this.planning.fieldCloseReady && (!last || Math.hypot(previewPoint.x - last.x, previewPoint.z - last.z) >= 0.15)) {
          this.planning.fieldDraft.push(previewPoint)
        }
      } else if (this.planning.dragStart && point && this.planning.buildType === 'wood-wall') {
        this.planning.dragPoints = wallLinePoints(this.planning.dragStart, point)
      }
      this.updateGhost()
    }, { signal })
    this.renderer.canvas.addEventListener('pointerleave', () => {
      if (this.planning.dragStart || this.planning.start) return
      this.planning.pointer = null
      this.planning.rawPointer = null
      this.updateGhost()
    }, { signal })
    this.renderer.canvas.addEventListener('pointerdown', e => {
      if (e.button !== 0) return

      if (this.planning.tool) {
        const raw = this.renderer.worldPointPrecise(e.clientX, e.clientY)
        if (!raw) return
        this.renderer.canvas.focus()

        if (this.planning.tool === 'road') {
          this.planning.roadAngleSnap = e.shiftKey
          const anchor = this.planning.roadControlPoints.at(-1) ?? null
          const point = snapRoadControlPoint(
            this.simulation.state.roads,
            raw,
            anchor,
            this.planning.gridSnap,
            this.planning.roadAngleSnap,
            this.planning.roadSnap,
          )
          if (!anchor || Math.hypot(point.x - anchor.x, point.z - anchor.z) >= 0.35) {
            this.planning.roadControlPoints.push(point)
            this.planning.start = this.planning.roadControlPoints[0]
          }
          this.planning.pointer = point
          this.planning.rawPointer = raw
          this.planning.roadDraft = sampleRoadCurve(this.planning.roadControlPoints, this.planning.roadCurve)
          this.planning.plotDraft = null
          this.message = this.planning.roadControlPoints.length === 1
            ? 'Road start placed. Move the mouse for a live preview; click to add points.'
            : 'Road point ' + this.planning.roadControlPoints.length + ' placed. Continue, or double-click / Enter to finish.'
          this.updateGhost()
          this.updateHud()
          e.preventDefault()
          return
        }

        if (this.planning.tool === 'field') {
          const point = this.planning.gridSnap ? snapPointToGrid(raw) : raw
          const first = this.planning.fieldControlPoints[0]
          if (
            this.planning.fieldControlPoints.length >= 3
            && first
            && Math.hypot(point.x - first.x, point.z - first.z) <= 0.9
          ) {
            this.planning.fieldCloseReady = true
            this.finalizeFieldDraft()
            e.preventDefault()
            return
          }

          const anchor = this.planning.fieldControlPoints.at(-1)
          if (!anchor || Math.hypot(point.x - anchor.x, point.z - anchor.z) >= 0.75) {
            if (this.planning.fieldControlPoints.length >= 8) {
              this.message = 'Field already has 8 corners. Click the first marker, press Enter, or double-click to finish.'
            } else {
              this.planning.fieldControlPoints.push(point)
              this.planning.start = this.planning.fieldControlPoints[0] ?? null
              this.planning.fieldCloseReady = false
              this.message = this.planning.fieldControlPoints.length < 3
                ? 'Field corner ' + this.planning.fieldControlPoints.length + ' placed. Add at least ' + (3 - this.planning.fieldControlPoints.length) + ' more.'
                : 'Field corner ' + this.planning.fieldControlPoints.length + ' placed. Click the first marker to close, or keep shaping.'
            }
          }
          this.planning.rawPointer = raw
          this.planning.pointer = point
          this.planning.fieldDraft = [...this.planning.fieldControlPoints]
          this.updateGhost()
          this.updateHud()
          e.preventDefault()
          return
        }

        this.planning.start = raw
        this.planning.pointer = raw
        this.planning.rawPointer = raw
        this.planning.roadDraft = []
        this.planning.plotDraft = null
        this.renderer.canvas.setPointerCapture(e.pointerId)
        this.updateGhost()
        e.preventDefault()
        return
      }

      if (this.planning.buildType !== 'wood-wall') return
      const point = this.renderer.worldPoint(e.clientX, e.clientY)
      if (!point) return
      this.renderer.canvas.focus()
      this.planning.dragStart = point
      this.planning.pointer = point
      this.planning.dragPoints = [point]
      this.renderer.canvas.setPointerCapture(e.pointerId)
      this.updateGhost()
      e.preventDefault()
    }, { signal })
    this.renderer.canvas.addEventListener('pointerup', e => {
      if (e.button !== 0) return

      if (this.planning.start && this.planning.tool === 'residential-plot') {
        const s = this.simulation.state
        const rawEnd = this.renderer.worldPointPrecise(e.clientX, e.clientY) ?? this.planning.rawPointer ?? this.planning.pointer ?? this.planning.start

        {
          const preview = residentialPlotPreview(s.roads, this.planning.start, rawEnd, 2.2, this.planning.gridSnap, s.residentialPlots)
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

        this.planning.start = null
        this.planning.roadDraft = []
        this.planning.plotDraft = null
        this.planning.rawPointer = null
        this.planning.suppressClick = true
        setTimeout(() => { this.planning.suppressClick = false }, 0)
        if (this.renderer.canvas.hasPointerCapture(e.pointerId)) this.renderer.canvas.releasePointerCapture(e.pointerId)
        this.updateGhost()
        this.updateHud()
        e.preventDefault()
        return
      }

      if (!this.planning.dragStart || this.planning.buildType !== 'wood-wall') return
      const end = this.renderer.worldPoint(e.clientX, e.clientY) ?? this.planning.pointer ?? this.planning.dragStart
      const points = wallLinePoints(this.planning.dragStart, end)
      const horizontal = Math.abs(end.x - this.planning.dragStart.x) >= Math.abs(end.z - this.planning.dragStart.z)
      const rotation = horizontal ? 1 : 0
      const error = placeBuildingBatch(this.simulation.state, 'wood-wall', points, rotation)
      this.message = error ?? (points.length + ' wall blueprint' + (points.length === 1 ? '' : 's') + ' placed. Drag again or Esc to finish.')
      if (!error) this.selectedId = this.simulation.state.buildings.at(-1)?.id ?? null
      this.planning.dragStart = null
      this.planning.dragPoints = []
      this.planning.suppressClick = true
      setTimeout(() => { this.planning.suppressClick = false }, 0)
      if (this.renderer.canvas.hasPointerCapture(e.pointerId)) this.renderer.canvas.releasePointerCapture(e.pointerId)
      this.updateGhost()
      this.updateHud()
      e.preventDefault()
    }, { signal })
    this.renderer.canvas.addEventListener('dblclick', e => {
      if (this.planning.tool !== 'road' && this.planning.tool !== 'field') return
      e.preventDefault()
      if (this.planning.tool === 'road') this.finalizeRoadDraft()
      else this.finalizeFieldDraft()
    }, { signal })
    this.renderer.canvas.addEventListener('contextmenu', e => {
      if (this.planning.tool !== 'road' && this.planning.tool !== 'field') return
      e.preventDefault()
      if (this.planning.tool === 'field') {
        if (this.planning.fieldControlPoints.length > 0) {
          this.planning.fieldControlPoints.pop()
          this.planning.start = this.planning.fieldControlPoints[0] ?? null
          this.planning.fieldDraft = [...this.planning.fieldControlPoints]
          this.message = this.planning.fieldControlPoints.length ? 'Removed last field corner.' : 'Field draft cleared.'
          this.updateGhost()
          this.updateHud()
        } else {
          this.action('cancel')
        }
        return
      }
      if (this.planning.roadControlPoints.length > 0) {
        this.planning.start = null
        this.planning.roadControlPoints = []
        this.planning.roadDraft = []
        this.planning.rawPointer = null
        this.planning.pointer = null
        this.message = 'Road draft cancelled. Click to start a new road; Esc exits the road tool.'
        this.updateGhost()
        this.updateHud()
      } else {
        this.action('cancel')
      }
    }, { signal })
    this.renderer.canvas.addEventListener('click', e => {
      if (this.planning.tool) return
      if (this.planning.suppressClick) {
        this.planning.suppressClick = false
        return
      }
      this.renderer.canvas.focus()
      const precise = this.renderer.worldPointPrecise(e.clientX, e.clientY)
      const p = precise ? { x: Math.round(precise.x), z: Math.round(precise.z) } : null
      if (!p || !precise) return
      const s = this.simulation.state
      if (this.planning.buildType) {
        const type = this.planning.buildType
        const preview = buildingPlacementPreview(
          s.roads,
          precise,
          type,
          buildingRequiresRoadFrontage(type) ? true : this.planning.roadSnap,
          this.planning.buildRotation,
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
          if (!e.shiftKey) this.planning.buildType = null
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
      if (this.planning.tool === 'road' && e.key === 'Shift') {
        if (!this.planning.roadAngleSnap) {
          this.planning.roadAngleSnap = true
          this.refreshRoadDraft()
          this.updateGhost()
          this.updateHud()
        }
        return
      }
      if (this.planning.tool === 'road' && e.key === 'Backspace') {
        e.preventDefault()
        this.undoRoadControlPoint()
        return
      }
      if (this.planning.tool === 'field' && e.key === 'Backspace') {
        e.preventDefault()
        if (this.planning.fieldControlPoints.length > 0) {
          this.planning.fieldControlPoints.pop()
          this.planning.start = this.planning.fieldControlPoints[0] ?? null
          this.planning.fieldDraft = [...this.planning.fieldControlPoints]
          this.message = this.planning.fieldControlPoints.length ? 'Removed last field corner.' : 'Field draft cleared.'
          this.updateGhost(); this.updateHud()
        }
        return
      }
      if (this.planning.tool === 'road' && e.key === 'Enter') {
        e.preventDefault()
        this.finalizeRoadDraft()
        return
      }
      if (this.planning.tool === 'field' && e.key === 'Enter') {
        e.preventDefault()
        this.finalizeFieldDraft()
        return
      }
      if (this.planning.tool === 'road' && e.key === '[') {
        e.preventDefault()
        this.adjustRoadWidth(-1)
        return
      }
      if (this.planning.tool === 'road' && e.key === ']') {
        e.preventDefault()
        this.adjustRoadWidth(1)
        return
      }
      if (this.planning.tool === 'road' && e.key.toLowerCase() === 'c') {
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
      if (e.key.toLowerCase() === 'r' && this.planning.buildType) {
        e.preventDefault()
        this.action('rotate-build')
      }
      if (e.key.toLowerCase() === 'v' && !this.planning.buildType && !this.planning.tool) {
        e.preventDefault()
        this.action('cinematic')
      }
    }, { signal })
    window.addEventListener('keyup', e => {
      if (e.key !== 'Shift' || !this.planning.roadAngleSnap) return
      this.planning.roadAngleSnap = false
      if (this.planning.tool === 'road') {
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
    this.accumulator = 0; this.selectedId = null; resetPlanningForImport(this.planning)
  }
  private refreshRoadDraft(): void {
    rebuildRoadDraft(this.planning, this.simulation.state)
  }

  private undoRoadControlPoint(): void {
    const message = removeRoadControlPoint(this.planning, this.simulation.state)
    if (message === null) return
    this.message = message
    this.updateGhost()
    this.updateHud()
  }

  private adjustRoadWidth(direction: -1 | 1): void {
    this.message = changeRoadWidth(this.planning, direction)
    this.updateGhost()
    this.updateHud()
  }

  private finalizeRoadDraft(): void {
    const message = commitRoadDraft(this.planning, this.simulation.state)
    if (message === null) return
    this.message = message
    this.updateGhost()
    this.updateHud()
  }

  private finalizeFieldDraft(): void {
    const result = commitFieldDraft(this.planning, this.simulation.state)
    if (result === null) return
    this.message = result.message
    if (result.selectedId !== undefined) this.selectedId = result.selectedId
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
          this.planning.buildType = null
          this.planning.tool = 'road'
          this.planning.start = null
          this.planning.roadControlPoints = []
          this.planning.roadDraft = []
          this.planning.fieldControlPoints = []
          this.planning.fieldDraft = []
          this.planning.plotDraft = null
          this.planning.dragStart = null
          this.planning.dragPoints = []
          this.renderer.mode = 'settlement'
          this.planning.roadAngleSnap = false
          this.message = 'Road tool · LMB adds points · move for live preview · double-click/Enter finishes · RMB cancels draft · Esc exits · Shift constrains angle · G grid · F road snap · C curve · [ / ] width.'
          break
        case 'road-curve':
          this.planning.roadCurve = this.planning.roadCurve < 0.2 ? 0.58 : this.planning.roadCurve < 0.8 ? 0.92 : 0
          this.message = 'Road curvature · ' + roadCurveLabel(this.planning.roadCurve) + '. Grid Snap only controls point positions; hold Shift for 0°/45°/90° segments.'
          this.refreshRoadDraft()
          break
        case 'road-width':
          this.planning.roadWidth = this.planning.roadWidth <= 1.25 ? 1.7 : this.planning.roadWidth < 2.35 ? 2.4 : 1.2
          this.message = 'Road width · ' + (this.planning.roadWidth <= 1.25 ? 'Path' : this.planning.roadWidth >= 2.35 ? 'Main road' : 'Lane') + ' · ' + this.planning.roadWidth.toFixed(1) + 'm.'
          break
        case 'field':
          if (!s.buildings.some(building => building.type === 'farmhouse' && !building.destroyed)) {
            this.message = 'Build a road-fronted Farmhouse before planning fields.'
            break
          }
          this.planning.buildType = null
          this.planning.tool = 'field'
          this.planning.start = null
          this.planning.roadControlPoints = []
          this.planning.roadDraft = []
          this.planning.fieldControlPoints = []
          this.planning.fieldDraft = []
          this.planning.fieldCloseReady = false
          this.planning.plotDraft = null
          this.planning.dragStart = null
          this.planning.dragPoints = []
          this.renderer.mode = 'settlement'
          this.message = 'Field tool · shared Grid Snap is ' + (this.planning.gridSnap ? 'ON' : 'OFF') + ' · click 3–8 corners within 18m of a Farmhouse · click the first marker to close · G toggles the same 1m grid used by roads.'
          break
        case 'residential-plot':
          if (s.roads.length === 0) {
            this.message = 'Draw a road first. Residential plots need road frontage.'
            break
          }
          this.planning.buildType = null
          this.planning.tool = 'residential-plot'
          this.planning.start = null
          this.planning.roadControlPoints = []
          this.planning.roadDraft = []
          this.planning.fieldControlPoints = []
          this.planning.fieldDraft = []
          this.planning.plotDraft = null
          this.planning.dragStart = null
          this.planning.dragPoints = []
          this.renderer.mode = 'settlement'
          this.message = 'Residential Plot: start close to a road, then drag frontage + backyard depth. ' + (this.planning.gridSnap ? 'Grid Snap rounds width/depth to 1m.' : 'Freeform dimensions enabled.')
          break
        case 'house': case 'stockpile': case 'guard-post': case 'wood-wall': case 'wood-gate': case 'campfire': case 'tavern': case 'brewery': case 'blacksmith': case 'market': case 'trading-post': case 'farmhouse': case 'foresters-lodge': case 'mine': case 'ore-yard': case 'fishing-hut': case 'pleasure-house':
          this.planning.buildType = action
          this.planning.tool = null
          this.planning.start = null
          this.planning.roadControlPoints = []
          this.planning.roadDraft = []
          this.planning.fieldControlPoints = []
          this.planning.fieldDraft = []
          this.planning.plotDraft = null
          this.planning.buildRotation = 0
          this.planning.dragStart = null
          this.planning.dragPoints = []
          this.renderer.mode = 'settlement'
          this.message = action === 'wood-wall'
            ? 'Drag across the grid to plan a wall line. Esc cancels.'
            : 'Place ' + BUILDINGS[action].label + '. ' + (this.planning.roadSnap && !BUILDINGS[action].fortification && action !== 'campfire'
              ? 'Road Snap ON: move near a road to magnetically align and face it. Press F to disable.'
              : 'Grid placement active; R rotates.')
          break
        case 'rotate-build':
          if (!this.planning.buildType) { this.message = 'Choose a building first.'; break }
          this.planning.buildRotation = (this.planning.buildRotation + 1) % 4
          this.message = BUILDINGS[this.planning.buildType].label + ' rotated to ' + ['South', 'East', 'North', 'West'][this.planning.buildRotation] + '.'
          break
        case 'grid-snap':
          this.planning.gridSnap = !this.planning.gridSnap
          this.message = 'Grid Snap ' + (this.planning.gridSnap
            ? 'ON · roads, residential dimensions and field corners use the shared 1m grid.'
            : 'OFF · roads, residential dimensions and field corners can be freeform.')
          if (this.planning.tool === 'road') {
            this.refreshRoadDraft()
          } else if (this.planning.tool === 'field') {
            this.planning.fieldDraft = [...this.planning.fieldControlPoints]
          } else if (this.planning.start && this.planning.tool === 'residential-plot') {
            this.planning.start = null
            this.planning.plotDraft = null
          }
          break
        case 'road-snap':
          this.planning.roadSnap = !this.planning.roadSnap
          this.message = 'Road Join Snap ' + (this.planning.roadSnap
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
          clearPlanningDrafts(this.planning)
          this.message = ''
          break
        }
        case 'close-inspector':
          if (this.selectedId !== null) {
            this.selectedId = null
            this.message = ''
            break
          }
          clearPlanningDrafts(this.planning)
          this.message = ''
          break
        case 'close-selection':
          this.selectedId = null
          this.message = ''
          break
        case 'cancel':
          clearPlanningDrafts(this.planning)
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
          clearPlanningDrafts(this.planning)
          this.renderer.mode = this.renderer.mode === 'settlement' ? 'follow' : 'settlement'
          if (this.renderer.mode === 'follow') this.renderer.cinematic = false
          break
        case 'cinematic':
          clearPlanningDrafts(this.planning)
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
          this.simulation.replace(imported); this.accumulator = 0; this.selectedId = null; resetPlanningForImport(this.planning)
          this.message = 'Imported and loaded save. The previous primary save is in the backup slot.'
          break
        }
        case 'import-error': throw new Error(value || 'Could not read the selected save file.')
      }
    } catch (error) { this.message = error instanceof Error ? error.message : 'Operation failed. Current settlement retained.' }
    this.updateGhost(); this.updateHud()
  }
  private updateGhost(): void {
    const message = updatePlanningGhost(this.renderer, this.simulation.state, this.planning)
    if (message !== undefined) this.message = message
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
      buildType: this.planning.buildType,
      planningTool: this.planning.tool,
      gridSnap: this.planning.gridSnap,
      roadSnap: this.planning.roadSnap,
      roadWidth: this.planning.roadWidth,
      roadCurve: this.planning.roadCurve,
      roadAngleSnap: this.planning.roadAngleSnap,
      roadPointCount: this.planning.roadControlPoints.length,
      fieldPointCount: this.planning.fieldControlPoints.length,
      buildRotation: this.planning.buildRotation,
      dragCount: this.planning.dragPoints.length,
      message: this.message,
      camera: this.renderer.mode,
      cameraPoint: this.renderer.focus,
      cinematic: this.renderer.cinematic,
      selectionAnchor,
      metrics: this.metrics,
    })
  }
}
