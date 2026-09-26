import { BUILDINGS } from '../data/buildings'
import { inBounds } from './Navigation'
import type { Building, Point, ResidentialPlot, ResourceNode, RoadPath } from './WorldState'

export type BackyardKind = ResidentialPlot['backyard']

export interface RoadSegmentHit {
  roadId: number
  segmentIndex: number
  point: Point
  tangent: Point
  distance: number
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

export function roadLength(points: Point[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z)
  return total
}

export function roadPlacementError(points: Point[]): string | null {
  if (points.length < 2 || roadLength(points) < 2) return 'Drag at least 2m to place a road.'
  if (points.length > 120) return 'Road is too long for one stroke. Place it in another segment.'
  if (points.some(point => !inBounds(point))) return 'Keep the road inside the settlement boundary.'
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
      }
    }
  }
  return best
}

const rotationStepsForFacing = (angle: number): number =>
  ((Math.round(angle / (Math.PI / 2)) % 4) + 4) % 4

export function residentialPlotPreview(
  roads: RoadPath[],
  start: Point,
  current: Point,
  roadSnapDistance = 2.2,
): ResidentialPlotPreview | null {
  const hit = nearestRoadSegment(roads, start, roadSnapDistance)
  if (!hit) return null

  const normal = { x: -hit.tangent.z, z: hit.tangent.x }
  const delta = subtract(current, hit.point)
  const along = dot(delta, hit.tangent)
  const normalAmount = dot(delta, normal)
  const side: 1 | -1 = normalAmount >= 0 ? 1 : -1
  const width = Math.abs(along)
  const depth = Math.abs(normalAmount)
  const frontageDirection = along >= 0 ? hit.tangent : { x: -hit.tangent.x, z: -hit.tangent.z }
  const rear = { x: normal.x * side, z: normal.z * side }
  const frontageA = { ...hit.point }
  const frontageB = addScaled(frontageA, frontageDirection, width)
  const frontageMid = {
    x: (frontageA.x + frontageB.x) / 2,
    z: (frontageA.z + frontageB.z) / 2,
  }
  const center = addScaled(frontageMid, rear, depth / 2)
  const towardRoad = { x: -rear.x, z: -rear.z }
  const angle = Math.atan2(towardRoad.x, towardRoad.z)
  const houseSetback = Math.min(Math.max(1.75, depth * 0.28), Math.max(1.75, depth - 2))
  const house = addScaled(frontageMid, rear, houseSetback)

  return {
    roadId: hit.roadId,
    frontageA,
    frontageB,
    width,
    depth,
    side,
    angle,
    center,
    housePoint: { x: Math.round(house.x), z: Math.round(house.z) },
    houseRotation: rotationStepsForFacing(angle),
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
): string | null {
  if (!preview) return 'Start the plot frontage close to a player road.'
  if (preview.width < 4) return 'Residential frontage must be at least 4m wide.'
  if (preview.width > 10) return 'Residential frontage cannot exceed 10m in this prototype.'
  if (preview.depth < 5) return 'Drag at least 5m back from the road for a usable backyard.'
  if (preview.depth > 13) return 'Residential plot depth cannot exceed 13m in this prototype.'
  if (plotCorners(preview).some(point => !inBounds(point))) return 'Keep the whole residential plot inside the settlement boundary.'
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
