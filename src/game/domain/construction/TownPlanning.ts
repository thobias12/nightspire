import { BUILDINGS, type BuildingId } from '../../data/buildings'
import { pointInPolygon, segmentsIntersect } from '../agriculture/FieldPlanning'
import { inBounds } from '../world/Navigation'
import type { Building, FieldPlot, Point, ResidentialPlot, ResourceNode, RoadPath } from '../world/WorldState'

export type BackyardKind = ResidentialPlot['backyard']

export interface RoadSegmentHit {
  roadId: number
  segmentIndex: number
  point: Point
  tangent: Point
  distance: number
  t: number
  roadWidth: number
  segmentA: Point
  segmentB: Point
}

export interface BuildingPlacementPreview {
  point: Point
  rotation: number
  facingAngle: number | null
  roadId: number | null
  snappedToRoad: boolean
}

export interface ResidentialPlotPreview {
  roadId: number
  frontageA: Point
  frontageB: Point
  width: number
  depth: number
  side: 1 | -1
  angle: number
  center: Point
  housePoint: Point
  houseRotation: number
  adjacentSnapped: boolean
}

const dot = (a: Point, b: Point): number => a.x * b.x + a.z * b.z
const subtract = (a: Point, b: Point): Point => ({ x: a.x - b.x, z: a.z - b.z })
const length = (p: Point): number => Math.hypot(p.x, p.z)
const normalize = (p: Point): Point => {
  const l = length(p)
  return l > 0 ? { x: p.x / l, z: p.z / l } : { x: 0, z: 1 }
}
const addScaled = (p: Point, d: Point, amount: number): Point => ({
  x: p.x + d.x * amount,
  z: p.z + d.z * amount,
})

export function snapPointToGrid(point: Point, step = 1): Point {
  return {
    x: Math.round(point.x / step) * step,
    z: Math.round(point.z / step) * step,
  }
}

function nearestRoadEndpoint(
  roads: RoadPath[],
  p: Point,
  maxDistance: number,
): { point: Point; distance: number } | null {
  let best: { point: Point; distance: number } | null = null
  for (const road of roads) {
    for (const point of [road.points[0], road.points[road.points.length - 1]]) {
      if (!point) continue
      const distance = Math.hypot(p.x - point.x, p.z - point.z)
      if (distance > maxDistance || (best && distance >= best.distance)) continue
      best = { point: { ...point }, distance }
    }
  }
  return best
}

export function insertRoadJunctionPoint(roads: RoadPath[], point: Point, epsilon = 0.06): boolean {
  let inserted = false
  for (const road of roads) {
    if (road.points.length >= 120) continue
    if (road.points.some(existing => Math.hypot(existing.x - point.x, existing.z - point.z) <= epsilon)) continue
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1]
      const b = road.points[i]
      const ab = subtract(b, a)
      const lengthSquared = dot(ab, ab)
      if (lengthSquared <= 1e-8) continue
      const t = dot(subtract(point, a), ab) / lengthSquared
      if (t <= 0.001 || t >= 0.999) continue
      const projected = addScaled(a, ab, t)
      if (Math.hypot(projected.x - point.x, projected.z - point.z) > epsilon) continue
      road.points.splice(i, 0, { ...point })
      inserted = true
      break
    }
  }
  return inserted
}

function nearestAlignedGridPoint(anchor: Point, raw: Point): Point {
  const p = snapPointToGrid(raw)
  const dx = p.x - anchor.x
  const dz = p.z - anchor.z
  const candidates: Point[] = [
    { x: p.x, z: anchor.z },
    { x: anchor.x, z: p.z },
  ]
  if (dx !== 0 && dz !== 0) {
    const diagonal = Math.max(1, Math.round((Math.abs(dx) + Math.abs(dz)) / 2))
    candidates.push({
      x: anchor.x + Math.sign(dx) * diagonal,
      z: anchor.z + Math.sign(dz) * diagonal,
    })
  }
  return candidates.sort((a, b) =>
    Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z)
  )[0]
}

function nearestAnglePoint(anchor: Point, raw: Point): Point {
  const dx = raw.x - anchor.x
  const dz = raw.z - anchor.z
  const distance = Math.hypot(dx, dz)
  if (distance <= 1e-8) return { ...anchor }
  const step = Math.PI / 4
  const angle = Math.round(Math.atan2(dz, dx) / step) * step
  return {
    x: anchor.x + Math.cos(angle) * distance,
    z: anchor.z + Math.sin(angle) * distance,
  }
}

export function snapRoadControlPoint(
  roads: RoadPath[],
  raw: Point,
  anchor: Point | null,
  gridSnap: boolean,
  angleSnap = false,
  roadSnap = true,
  joinDistance = 1.35,
): Point {
  let point = gridSnap ? snapPointToGrid(raw) : { ...raw }

  if (anchor && angleSnap) {
    point = gridSnap
      ? nearestAlignedGridPoint(anchor, point)
      : nearestAnglePoint(anchor, point)
  }

  if (!roadSnap) return point

  const endpoint = nearestRoadEndpoint(roads, point, joinDistance * 1.45)
  if (endpoint) return endpoint.point

  const join = nearestRoadSegment(roads, point, joinDistance)
  if (join) return { ...join.point }
  return point
}

export function normalizeRoadPoints(points: Point[], minSpacing = 0.55): Point[] {
  if (points.length === 0) return []
  const normalized: Point[] = [{ ...points[0] }]
  for (let i = 1; i < points.length; i++) {
    const point = points[i]
    const previous = normalized[normalized.length - 1]
    if (Math.hypot(point.x - previous.x, point.z - previous.z) >= minSpacing) normalized.push({ ...point })
  }
  const last = points[points.length - 1]
  const tail = normalized[normalized.length - 1]
  if (Math.hypot(last.x - tail.x, last.z - tail.z) > 0.08) normalized.push({ ...last })
  return normalized
}

export function sampleRoadCurve(
  controlPoints: Point[],
  curvature = 0.72,
  sampleSpacing = 0.75,
): Point[] {
  if (controlPoints.length < 2) return controlPoints.map(point => ({ ...point }))
  const controls = normalizeRoadPoints(controlPoints, 0.08)
  if (controls.length < 2) return controls
  if (curvature <= 0.001) return normalizeRoadPoints(controls)

  const strength = Math.max(0, Math.min(1, curvature)) * 0.5
  const approximateLength = roadLength(controls)
  const effectiveSpacing = Math.max(0.35, sampleSpacing, approximateLength / 90)
  const sampled: Point[] = [{ ...controls[0] }]

  for (let segment = 0; segment < controls.length - 1; segment++) {
    const p0 = controls[Math.max(0, segment - 1)]
    const p1 = controls[segment]
    const p2 = controls[segment + 1]
    const p3 = controls[Math.min(controls.length - 1, segment + 2)]
    const segmentLength = Math.hypot(p2.x - p1.x, p2.z - p1.z)
    const steps = Math.max(1, Math.ceil(segmentLength / effectiveSpacing))

    const m1 = {
      x: (p2.x - p0.x) * strength,
      z: (p2.z - p0.z) * strength,
    }
    const m2 = {
      x: (p3.x - p1.x) * strength,
      z: (p3.z - p1.z) * strength,
    }

    for (let step = 1; step <= steps; step++) {
      const t = step / steps
      const t2 = t * t
      const t3 = t2 * t
      const h00 = 2 * t3 - 3 * t2 + 1
      const h10 = t3 - 2 * t2 + t
      const h01 = -2 * t3 + 3 * t2
      const h11 = t3 - t2
      sampled.push({
        x: p1.x * h00 + m1.x * h10 + p2.x * h01 + m2.x * h11,
        z: p1.z * h00 + m1.z * h10 + p2.z * h01 + m2.z * h11,
      })
      if (sampled.length >= 120) {
        sampled[sampled.length - 1] = { ...controls[controls.length - 1] }
        return normalizeRoadPoints(sampled, 0.32)
      }
    }
  }

  sampled[sampled.length - 1] = { ...controls[controls.length - 1] }
  return normalizeRoadPoints(sampled, 0.32)
}

export function roadLength(points: Point[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z)
  return total
}

export function roadPlacementError(points: Point[], fields: FieldPlot[] = [], half = 23): string | null {
  if (points.length < 2 || roadLength(points) < 2) return 'Road needs at least 2m between its first and final points.'
  if (points.length > 120) return 'Road is too long for one stroke. Place it in another segment.'
  if (points.some(point => !inBounds(point, half))) return 'Keep the road inside the settlement boundary.'
  for (const field of fields) {
    if (points.some(point => pointInPolygon(point, field.points))) return 'Road cannot run through a farm field.'
    for (let i = 1; i < points.length; i++) {
      for (let j = 0; j < field.points.length; j++) {
        if (segmentsIntersect(points[i - 1], points[i], field.points[j], field.points[(j + 1) % field.points.length])) {
          return 'Road cannot cross a farm field boundary.'
        }
      }
    }
  }
  return null
}

export function nearestRoadSegment(roads: RoadPath[], p: Point, maxDistance = Infinity): RoadSegmentHit | null {
  let best: RoadSegmentHit | null = null
  for (const road of roads) {
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1]
      const b = road.points[i]
      const ab = subtract(b, a)
      const lengthSquared = dot(ab, ab)
      if (lengthSquared <= 1e-8) continue
      const t = Math.max(0, Math.min(1, dot(subtract(p, a), ab) / lengthSquared))
      const point = addScaled(a, ab, t)
      const distance = Math.hypot(p.x - point.x, p.z - point.z)
      if (distance > maxDistance || (best && distance >= best.distance)) continue
      best = {
        roadId: road.id,
        segmentIndex: i - 1,
        point,
        tangent: normalize(ab),
        distance,
        t,
        roadWidth: road.width,
        segmentA: { ...a },
        segmentB: { ...b },
      }
    }
  }
  return best
}

const rotationStepsForFacing = (angle: number): number =>
  ((Math.round(angle / (Math.PI / 2)) % 4) + 4) % 4

export function buildingRequiresRoadFrontage(type: BuildingId): boolean {
  const def = BUILDINGS[type]
  // Houses get their road frontage from Residential Plots; walls/gates are linear fortifications.
  return !def.fortification && type !== 'house'
}

export function buildingRoadPlacementError(
  roads: RoadPath[],
  point: Point,
  type: BuildingId,
  frontageSlack = 0.9,
): string | null {
  if (!buildingRequiresRoadFrontage(type)) return null
  if (roads.length === 0) return BUILDINGS[type].label + ' needs road frontage. Build a road first.'
  const hit = nearestRoadSegment(roads, point)
  if (!hit) return BUILDINGS[type].label + ' needs road frontage.'
  const maxDistance = hit.roadWidth / 2 + BUILDINGS[type].footprint / 2 + frontageSlack
  return hit.distance <= maxDistance
    ? null
    : BUILDINGS[type].label + ' must be placed beside a road.'
}

export function buildingPlacementPreview(
  roads: RoadPath[],
  raw: Point,
  type: BuildingId,
  roadSnap: boolean,
  manualRotation = 0,
  roadSnapDistance = 3.8,
): BuildingPlacementPreview {
  const point = snapPointToGrid(raw)
  const def = BUILDINGS[type]
  if (!roadSnap || def.fortification || type === 'house') {
    return {
      point,
      rotation: ((Math.round(manualRotation) % 4) + 4) % 4,
      facingAngle: null,
      roadId: null,
      snappedToRoad: false,
    }
  }

  const hit = nearestRoadSegment(roads, raw, roadSnapDistance)
  if (!hit) {
    return {
      point,
      rotation: ((Math.round(manualRotation) % 4) + 4) % 4,
      facingAngle: null,
      roadId: null,
      snappedToRoad: false,
    }
  }

  const normal = { x: -hit.tangent.z, z: hit.tangent.x }
  const signed = dot(subtract(raw, hit.point), normal)
  const side: 1 | -1 = signed >= 0 ? 1 : -1
  const outward = { x: normal.x * side, z: normal.z * side }
  const offset = hit.roadWidth / 2 + def.footprint / 2 + 0.28
  const snappedCenter = snapPointToGrid(addScaled(hit.point, outward, offset))
  const towardRoad = { x: -outward.x, z: -outward.z }
  const angle = Math.atan2(towardRoad.x, towardRoad.z)

  return {
    point: snappedCenter,
    rotation: rotationStepsForFacing(angle),
    facingAngle: angle,
    roadId: hit.roadId,
    snappedToRoad: true,
  }
}

export function residentialPlotPreview(
  roads: RoadPath[],
  start: Point,
  current: Point,
  roadSnapDistance = 2.2,
  gridSnap = false,
  existingPlots: ResidentialPlot[] = [],
  adjacentSnapDistance = 1.15,
): ResidentialPlotPreview | null {
  const hit = nearestRoadSegment(roads, start, roadSnapDistance)
  if (!hit) return null

  const normal = { x: -hit.tangent.z, z: hit.tangent.x }
  const normalAmountFromCenter = dot(subtract(current, hit.point), normal)
  const side: 1 | -1 = normalAmountFromCenter >= 0 ? 1 : -1
  const rear = { x: normal.x * side, z: normal.z * side }
  const roadEdge = hit.roadWidth / 2 + 0.12

  let frontageA = addScaled(hit.point, rear, roadEdge)
  let adjacentSnapped = false

  if (gridSnap) {
    const candidates = existingPlots
      .filter(plot => plot.roadId === hit.roadId && plot.side === side)
      .flatMap(plot => [plot.frontageA, plot.frontageB])
      .map(point => ({ point, distance: Math.hypot(point.x - frontageA.x, point.z - frontageA.z) }))
      .filter(candidate => candidate.distance <= adjacentSnapDistance)
      .sort((a, b) => a.distance - b.distance)

    if (candidates[0]) {
      frontageA = { ...candidates[0].point }
      adjacentSnapped = true
    }
  }

  const delta = subtract(current, frontageA)
  const along = dot(delta, hit.tangent)
  const normalAmount = dot(delta, normal)
  const width = gridSnap ? Math.round(Math.abs(along)) : Math.abs(along)
  const depth = gridSnap ? Math.round(Math.abs(normalAmount)) : Math.abs(normalAmount)
  const frontageDirection = along >= 0 ? hit.tangent : { x: -hit.tangent.x, z: -hit.tangent.z }
  let frontageB = addScaled(frontageA, frontageDirection, width)

  if (gridSnap) {
    const endCandidates = existingPlots
      .filter(plot => plot.roadId === hit.roadId && plot.side === side)
      .flatMap(plot => [plot.frontageA, plot.frontageB])
      .map(point => ({
        point,
        distance: Math.hypot(point.x - frontageB.x, point.z - frontageB.z),
        along: dot(subtract(point, frontageA), frontageDirection),
        across: Math.abs(dot(subtract(point, frontageA), rear)),
      }))
      .filter(candidate => candidate.distance <= adjacentSnapDistance && candidate.along >= 3.5 && candidate.across <= 0.18)
      .sort((a, b) => a.distance - b.distance)

    if (endCandidates[0]) {
      frontageB = { ...endCandidates[0].point }
      adjacentSnapped = true
    }
  }

  const snappedWidth = Math.hypot(frontageB.x - frontageA.x, frontageB.z - frontageA.z)
  const frontageMid = {
    x: (frontageA.x + frontageB.x) / 2,
    z: (frontageA.z + frontageB.z) / 2,
  }
  const center = addScaled(frontageMid, rear, depth / 2)
  const towardRoad = { x: -rear.x, z: -rear.z }
  const angle = Math.atan2(towardRoad.x, towardRoad.z)
  const houseSetback = Math.min(Math.max(1.55, depth * 0.25), Math.max(1.55, depth - 2))
  const house = addScaled(frontageMid, rear, houseSetback)

  return {
    roadId: hit.roadId,
    frontageA,
    frontageB,
    width: snappedWidth,
    depth,
    side,
    angle,
    center,
    housePoint: { x: Math.round(house.x), z: Math.round(house.z) },
    houseRotation: rotationStepsForFacing(angle),
    adjacentSnapped,
  }
}

export function plotCorners(plot: Pick<ResidentialPlotPreview, 'frontageA' | 'frontageB' | 'depth' | 'side'>): Point[] {
  const tangent = normalize(subtract(plot.frontageB, plot.frontageA))
  const normal = { x: -tangent.z * plot.side, z: tangent.x * plot.side }
  return [
    { ...plot.frontageA },
    { ...plot.frontageB },
    addScaled(plot.frontageB, normal, plot.depth),
    addScaled(plot.frontageA, normal, plot.depth),
  ]
}

const axesFor = (corners: Point[]): Point[] => {
  const edges = [subtract(corners[1], corners[0]), subtract(corners[3], corners[0])]
  return edges.map(edge => normalize({ x: -edge.z, z: edge.x }))
}

const overlapsOnAxis = (a: Point[], b: Point[], axis: Point): boolean => {
  const aValues = a.map(point => dot(point, axis))
  const bValues = b.map(point => dot(point, axis))
  return Math.max(...aValues) > Math.min(...bValues) + 0.08
    && Math.max(...bValues) > Math.min(...aValues) + 0.08
}

export function residentialPlotsOverlap(a: ResidentialPlotPreview | ResidentialPlot, b: ResidentialPlotPreview | ResidentialPlot): boolean {
  const ac = plotCorners(a)
  const bc = plotCorners(b)
  return [...axesFor(ac), ...axesFor(bc)].every(axis => overlapsOnAxis(ac, bc, axis))
}

export function pointInResidentialPlot(
  plot: ResidentialPlotPreview | ResidentialPlot,
  point: Point,
  margin = 0,
): boolean {
  const tangent = normalize(subtract(plot.frontageB, plot.frontageA))
  const rear = { x: -tangent.z * plot.side, z: tangent.x * plot.side }
  const relative = subtract(point, plot.frontageA)
  const along = dot(relative, tangent)
  const back = dot(relative, rear)
  const width = Math.hypot(plot.frontageB.x - plot.frontageA.x, plot.frontageB.z - plot.frontageA.z)
  return along >= -margin && along <= width + margin && back >= -margin && back <= plot.depth + margin
}

export function residentialPlotResourceError(
  preview: ResidentialPlotPreview | null,
  nodes: ResourceNode[],
): string | null {
  if (!preview) return null
  return nodes.some(node => node.remaining > 0 && pointInResidentialPlot(preview, node, 0.45))
    ? 'Clear resources from the residential plot first.'
    : null
}

export function residentialPlotBuildingError(
  preview: ResidentialPlotPreview | null,
  buildings: Building[],
): string | null {
  if (!preview) return null
  const plot = plotCorners(preview)
  for (const building of buildings) {
    if (building.destroyed) continue
    const half = BUILDINGS[building.type].footprint / 2
    const buildingCorners: Point[] = [
      { x: building.x - half, z: building.z - half },
      { x: building.x + half, z: building.z - half },
      { x: building.x + half, z: building.z + half },
      { x: building.x - half, z: building.z + half },
    ]
    if ([...axesFor(plot), ...axesFor(buildingCorners)].every(axis => overlapsOnAxis(plot, buildingCorners, axis))) {
      return 'Residential plot overlaps an existing building or ruin.'
    }
  }
  return null
}

export function residentialPlotError(
  preview: ResidentialPlotPreview | null,
  existing: ResidentialPlot[],
  half = 23,
): string | null {
  if (!preview) return 'Start the plot frontage close to a player road.'
  if (preview.width < 4) return 'Residential frontage must be at least 4m wide.'
  if (preview.width > 10) return 'Residential frontage cannot exceed 10m in this prototype.'
  if (preview.depth < 5) return 'Drag at least 5m back from the road for a usable backyard.'
  if (preview.depth > 13) return 'Residential plot depth cannot exceed 13m in this prototype.'
  if (plotCorners(preview).some(point => !inBounds(point, half))) return 'Keep the whole residential plot inside the settlement boundary.'
  if (existing.some(plot => residentialPlotsOverlap(preview, plot))) return 'Residential plots cannot overlap.'
  return null
}

export function backyardForPlot(id: number, depth: number): BackyardKind {
  if (depth < 7) return 'firewood'
  return (['garden', 'chickens', 'workyard'] as const)[id % 3]
}

export function residentialPlotWidth(plot: Pick<ResidentialPlot, 'frontageA' | 'frontageB'>): number {
  return Math.hypot(plot.frontageB.x - plot.frontageA.x, plot.frontageB.z - plot.frontageA.z)
}
