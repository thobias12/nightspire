import { BUILDINGS } from '../data/buildings'
import type { WorldState } from '../model/WorldState'
import type { SceneRenderer } from '../render/SceneRenderer'
import { placementBatchError, placementError } from '../systems/construction/Buildings'
import { fieldArea, fieldPlacementError, residentialPlotFieldError } from '../world/FieldPlanning'
import { worldHalf } from '../world/MapGenerator'
import {
  buildingPlacementPreview,
  buildingRequiresRoadFrontage,
  buildingRoadPlacementError,
  residentialPlotBuildingError,
  residentialPlotError,
  residentialPlotResourceError,
  roadLength,
  roadPlacementError,
} from '../world/TownPlanning'
import { roadCurveLabel } from './PlanningOperations'
import type { PlanningState } from './PlanningState'

/**
 * Projects planning state into renderer ghosts.
 * Returns a user-facing planning message only when the active preview owns one.
 */
export function updatePlanningGhost(
  renderer: SceneRenderer,
  state: WorldState,
  planning: PlanningState,
): string | undefined {
  if (planning.tool === 'field') {
    const points = planning.fieldControlPoints.length ? planning.fieldDraft : []
    const error = points.length >= 3
      ? fieldPlacementError(points, state.fields, state.buildings, state.residentialPlots, state.nodes, state.roads, worldHalf(state),state.map)
      : null
    renderer.showFieldGhost(points, !error, planning.gridSnap)
    if (!planning.fieldControlPoints.length) return undefined

    const area = points.length >= 3 ? fieldArea(points) : 0
    const projectedYield = area > 0 ? Math.max(8, Math.min(60, Math.round(area * 0.55))) : 0
    return error ?? (
      'Field preview · ' + (area > 0 ? area.toFixed(1) + 'm² · about ' + projectedYield + ' Food · ' : '')
      + planning.fieldControlPoints.length + ' fixed corner' + (planning.fieldControlPoints.length === 1 ? '' : 's')
      + (planning.fieldCloseReady
        ? ' · click to close this parcel.'
        : ' · continue shaping or return to the first marker to close.')
    )
  }

  if (planning.tool === 'road') {
    const points = planning.roadControlPoints.length ? planning.roadDraft : []
    const error = points.length >= 2 ? roadPlacementError(points, state.fields, worldHalf(state),state.map,planning.roadWidth) : null
    renderer.showRoadGhost(points, !error, planning.gridSnap, planning.roadWidth)
    if (!planning.roadControlPoints.length || !planning.rawPointer) return undefined
    return error ?? (
      'Road preview · ' + roadLength(points).toFixed(1) + 'm · '
      + roadCurveLabel(planning.roadCurve) + ' · ' + planning.roadWidth.toFixed(1)
      + 'm · ' + (planning.roadAngleSnap ? 'Shift angle constrain ON · ' : '')
      + (planning.gridSnap ? 'Grid ON · ' : 'Grid OFF · ')
      + (planning.roadSnap ? 'Road Snap ON · ' : 'Road Snap OFF · ')
      + 'click point ' + (planning.roadControlPoints.length + 1) + ', double-click / Enter to finish.'
    )
  }

  if (planning.tool === 'residential-plot') {
    const preview = planning.plotDraft
    let error = residentialPlotError(preview, state.residentialPlots, worldHalf(state),state.map)
    if (!error) error = residentialPlotBuildingError(preview, state.buildings)
    if (!error) error = residentialPlotResourceError(preview, state.nodes)
    if (!error) error = residentialPlotFieldError(preview, state.fields)
    if (!error && preview) error = placementError(state, 'house', preview.housePoint)
    renderer.showResidentialPlotGhost(preview, !error, planning.gridSnap)
    if (!planning.start) return undefined
    return error ?? (preview
      ? 'Residential plot preview · ' + preview.width.toFixed(1) + 'm frontage × ' + preview.depth.toFixed(1) + 'm depth.'
        + (preview.adjacentSnapped ? ' · Edge snapped to neighboring plot.' : '')
        + ' Release to plan.'
      : 'Start close to a player road and drag diagonally into the backyard.')
  }

  if (planning.buildType === 'wood-wall' && planning.dragStart && planning.dragPoints.length) {
    const end = planning.dragPoints.at(-1)!
    const horizontal = Math.abs(end.x - planning.dragStart.x) >= Math.abs(end.z - planning.dragStart.z)
    const rotation = horizontal ? 1 : 0
    const error = placementBatchError(state, 'wood-wall', planning.dragPoints, rotation)
    renderer.showGhost('wood-wall', end, !error, rotation, planning.dragPoints)
    return error ?? ('Wall line: ' + planning.dragPoints.length + ' segment' + (planning.dragPoints.length === 1 ? '' : 's') + '. Release to place.')
  }

  const placement = planning.buildType && (planning.rawPointer ?? planning.pointer)
    ? buildingPlacementPreview(
        state.roads,
        planning.rawPointer ?? planning.pointer!,
        planning.buildType,
        buildingRequiresRoadFrontage(planning.buildType) ? true : planning.roadSnap,
        planning.buildRotation,
      )
    : null
  const error = planning.buildType && placement
    ? placementError(state, planning.buildType, placement.point)
      ?? buildingRoadPlacementError(state.roads, placement.point, planning.buildType)
    : null
  renderer.showGhost(planning.buildType, placement?.point ?? planning.pointer, !error, placement?.rotation ?? planning.buildRotation, [], placement?.facingAngle ?? null)
  if (!planning.buildType || !placement) return undefined

  if (planning.buildType === 'wood-gate' && !error) {
    const wall = state.buildings.find(building => building.type === 'wood-wall' && building.x === placement.point.x && building.z === placement.point.z)
    return wall ? 'Valid gate insertion. Existing wall timber will be retained.' : 'Valid site. Click to place.'
  }
  if (!error && placement.snappedToRoad) {
    return 'Road frontage · ' + BUILDINGS[planning.buildType].label + ' is aligned to the street. Conventional buildings must stay road-connected.'
  }
  return error ?? (planning.buildType === 'wood-wall'
    ? 'Click or drag to place Wooden Walls.'
    : 'Valid grid site. Click to place · Shift keeps build mode · R rotates.')
}
