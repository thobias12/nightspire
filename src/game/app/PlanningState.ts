import type { BuildingId } from '../data/buildings'
import type { Point } from '../model/WorldState'
import type { ResidentialPlotPreview } from '../world/TownPlanning'

export type PlanningTool = 'road' | 'residential-plot' | 'field' | null

export interface PlanningState {
  buildType: BuildingId | null
  buildRotation: number
  tool: PlanningTool
  start: Point | null
  roadControlPoints: Point[]
  roadDraft: Point[]
  roadWidth: number
  roadCurve: number
  roadAngleSnap: boolean
  plotDraft: ResidentialPlotPreview | null
  fieldControlPoints: Point[]
  fieldDraft: Point[]
  fieldCloseReady: boolean
  pointer: Point | null
  rawPointer: Point | null
  gridSnap: boolean
  roadSnap: boolean
  dragStart: Point | null
  dragPoints: Point[]
  suppressClick: boolean
}

export function createPlanningState(): PlanningState {
  return {
    buildType: null,
    buildRotation: 0,
    tool: null,
    start: null,
    roadControlPoints: [],
    roadDraft: [],
    roadWidth: 1.7,
    roadCurve: 0.72,
    roadAngleSnap: false,
    plotDraft: null,
    fieldControlPoints: [],
    fieldDraft: [],
    fieldCloseReady: false,
    pointer: null,
    rawPointer: null,
    gridSnap: true,
    roadSnap: true,
    dragStart: null,
    dragPoints: [],
    suppressClick: false,
  }
}

/** Clears transient placement/planning state while preserving user snap/road preferences. */
export function clearPlanningDrafts(state: PlanningState, clearBuild = true): void {
  if (clearBuild) state.buildType = null
  state.tool = null
  state.start = null
  state.roadControlPoints = []
  state.roadDraft = []
  state.roadAngleSnap = false
  state.plotDraft = null
  state.fieldControlPoints = []
  state.fieldDraft = []
  state.fieldCloseReady = false
  state.pointer = null
  state.rawPointer = null
  state.dragStart = null
  state.dragPoints = []
  state.suppressClick = false
}

export function resetPlanningForImport(state: PlanningState): void {
  clearPlanningDrafts(state)
  state.buildRotation = 0
}
