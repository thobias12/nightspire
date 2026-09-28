import type { WorldState } from '../model/WorldState'
import { createField, fieldPlacementError, nearestFarmhouseForField } from '../world/FieldPlanning'
import { worldHalf } from '../world/MapGenerator'
import { insertRoadJunctionPoint, roadLength, roadPlacementError, sampleRoadCurve, snapRoadControlPoint } from '../world/TownPlanning'
import type { PlanningState } from './PlanningState'

export function roadCurveLabel(curve: number): string {
  if (curve <= 0.05) return 'Straight'
  return curve < 0.8 ? 'Smooth' : 'Curved'
}

export function refreshRoadDraft(planning: PlanningState, state: WorldState): void {
  if (planning.tool !== 'road') return
  if (!planning.roadControlPoints.length) { planning.roadDraft = []; return }
  const controls = [...planning.roadControlPoints]
  const anchor = controls[controls.length - 1]
  if (planning.rawPointer) {
    const end = snapRoadControlPoint(state.roads, planning.rawPointer, anchor, planning.gridSnap, planning.roadAngleSnap, planning.roadSnap)
    if (Math.hypot(end.x - anchor.x, end.z - anchor.z) >= 0.08) controls.push(end)
  }
  planning.roadDraft = sampleRoadCurve(controls, planning.roadCurve)
}

export function undoRoadControlPoint(planning: PlanningState, state: WorldState): string | null {
  if (planning.tool !== 'road' || !planning.roadControlPoints.length) return null
  planning.roadControlPoints.pop()
  planning.start = planning.roadControlPoints[0] ?? null
  refreshRoadDraft(planning, state)
  return planning.roadControlPoints.length
    ? 'Removed last road point. Continue shaping or finish with Enter.'
    : 'Road draft cleared. Click to place a new start point.'
}

export function adjustRoadWidth(planning: PlanningState, direction: -1 | 1): string {
  const widths = [1.2, 1.7, 2.4]
  let index = widths.findIndex(width => Math.abs(width - planning.roadWidth) < 0.05)
  if (index < 0) index = 1
  index = Math.max(0, Math.min(widths.length - 1, index + direction))
  planning.roadWidth = widths[index]
  return 'Road width · ' + (planning.roadWidth <= 1.25 ? 'Path' : planning.roadWidth >= 2.35 ? 'Main road' : 'Lane') + ' · ' + planning.roadWidth.toFixed(1) + 'm.'
}

export function finalizeRoadDraft(planning: PlanningState, state: WorldState): string | null {
  if (planning.tool !== 'road') return null
  const points = sampleRoadCurve(planning.roadControlPoints, planning.roadCurve)
  const error = roadPlacementError(points, state.fields, worldHalf(state))
  if (error) return error
  for (const control of planning.roadControlPoints) insertRoadJunctionPoint(state.roads, control)
  state.roads.push({ id: state.nextId++, points, width: planning.roadWidth })
  const message = 'Road placed · ' + roadLength(points).toFixed(1) + 'm · ' + roadCurveLabel(planning.roadCurve) + ' · ' + planning.roadWidth.toFixed(1) + 'm. Click to start another road.'
  planning.start = null
  planning.roadControlPoints = []
  planning.roadDraft = []
  planning.rawPointer = null
  planning.pointer = null
  return message
}

export function finalizeFieldDraft(planning: PlanningState, state: WorldState): { message: string; selectedId?: number } | null {
  if (planning.tool !== 'field') return null
  const points = planning.fieldControlPoints.map(point => ({ ...point }))
  const error = fieldPlacementError(points, state.fields, state.buildings, state.residentialPlots, state.nodes, state.roads, worldHalf(state))
  if (error) return { message: error }
  const farmhouse = nearestFarmhouseForField(points, state.buildings)
  if (!farmhouse) return { message: 'Field needs a Farmhouse within 18m.' }
  const field = createField(state.nextId++, points, farmhouse.id)
  state.fields.push(field)
  planning.start = null
  planning.fieldControlPoints = []
  planning.fieldDraft = []
  planning.fieldCloseReady = false
  planning.rawPointer = null
  planning.pointer = null
  return {
    selectedId: field.id,
    message: 'Field linked to Farmhouse ' + farmhouse.id + ' · ' + field.area.toFixed(1) + 'm² · expected harvest ' + field.yield + ' Food. Click to start another field.',
  }
}
