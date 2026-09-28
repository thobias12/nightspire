import type { BuildingId } from '../data/buildings'

export interface Metrics { frame: number; simulation: number; render: number; calls: number; triangles: number; paths: number; requests: number; queue: number; failures: number; dropped: number }
export interface HudState {
  paused: boolean
  selectedId: number | null
  buildType: BuildingId | null
  planningTool: 'road' | 'residential-plot' | 'field' | null
  gridSnap: boolean
  roadSnap: boolean
  roadWidth: number
  roadCurve: number
  roadAngleSnap: boolean
  roadPointCount: number
  fieldPointCount: number
  buildRotation: number
  dragCount: number
  message: string
  cameraPoint?: { x: number; z: number }
  camera: string
  cinematic: boolean
  selectionAnchor: { x: number; y: number } | null
  metrics: Metrics
}
