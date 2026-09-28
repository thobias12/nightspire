import { BUILDINGS } from '../data/buildings'
import { inBounds } from './Navigation'
import type { Building, FieldPlot, Point, ResidentialPlot, ResourceNode, RoadPath } from './WorldState'

const EPSILON = 1e-7
export const FIELD_FARMHOUSE_RADIUS = 18

export function fieldArea(points: Point[]): number {
  if (points.length < 3) return 0
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    area += a.x * b.z - b.x * a.z
  }
  return Math.abs(area) / 2
}

export function fieldCentroid(points: Point[]): Point {
  if (points.length === 0) return { x: 0, z: 0 }
  let crossSum = 0, x = 0, z = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    const cross = a.x * b.z - b.x * a.z
    crossSum += cross
    x += (a.x + b.x) * cross
    z += (a.z + b.z) * cross
  }
  if (Math.abs(crossSum) < EPSILON) {
    return {
      x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
      z: points.reduce((sum, point) => sum + point.z, 0) / points.length,
    }
  }
  return { x: x / (3 * crossSum), z: z / (3 * crossSum) }
}

export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j]
    const crosses = (a.z > point.z) !== (b.z > point.z)
      && point.x < (b.x - a.x) * (point.z - a.z) / ((b.z - a.z) || EPSILON) + a.x
    if (crosses) inside = !inside
  }
  return inside
}

function orientation(a: Point, b: Point, c: Point): number {
  return (b.z - a.z) * (c.x - b.x) - (b.x - a.x) * (c.z - b.z)
}

function onSegment(a: Point, b: Point, c: Point): boolean {
  return b.x <= Math.max(a.x, c.x) + EPSILON && b.x + EPSILON >= Math.min(a.x, c.x)
    && b.z <= Math.max(a.z, c.z) + EPSILON && b.z + EPSILON >= Math.min(a.z, c.z)
}

export function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = orientation(a, b, c)
  const o2 = orientation(a, b, d)
  const o3 = orientation(c, d, a)
  const o4 = orientation(c, d, b)
  if ((o1 > EPSILON && o2 < -EPSILON || o1 < -EPSILON && o2 > EPSILON)
    && (o3 > EPSILON && o4 < -EPSILON || o3 < -EPSILON && o4 > EPSILON)) return true
  if (Math.abs(o1) <= EPSILON && onSegment(a, c, b)) return true
  if (Math.abs(o2) <= EPSILON && onSegment(a, d, b)) return true
  if (Math.abs(o3) <= EPSILON && onSegment(c, a, d)) return true
  if (Math.abs(o4) <= EPSILON && onSegment(c, b, d)) return true
  return false
}

export function simpleFieldPolygon(points: Point[]): boolean {
  if (points.length < 3) return false
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length]
    if (Math.hypot(a.x - b.x, a.z - b.z) < 0.75) return false
    for (let j = i + 1; j < points.length; j++) {
      if (j === i || j === (i + 1) % points.length || (i === 0 && j === points.length - 1)) continue
      const c = points[j], d = points[(j + 1) % points.length]
      if (segmentsIntersect(a, b, c, d)) return false
    }
  }
  return true
}

export function polygonsOverlap(a: Point[], b: Point[]): boolean {
  if (a.some(point => pointInPolygon(point, b)) || b.some(point => pointInPolygon(point, a))) return true
  for (let i = 0; i < a.length; i++) {
    const aa = a[i], ab = a[(i + 1) % a.length]
    for (let j = 0; j < b.length; j++) {
      if (segmentsIntersect(aa, ab, b[j], b[(j + 1) % b.length])) return true
    }
  }
  return false
}

function buildingCorners(building: Building): Point[] {
  const half = BUILDINGS[building.type].footprint / 2
  return [
    { x: building.x - half, z: building.z - half },
    { x: building.x + half, z: building.z - half },
    { x: building.x + half, z: building.z + half },
    { x: building.x - half, z: building.z + half },
  ]
}

function residentialCorners(plot: ResidentialPlot): Point[] {
  const dx = plot.frontageB.x - plot.frontageA.x
  const dz = plot.frontageB.z - plot.frontageA.z
  const width = Math.max(EPSILON, Math.hypot(dx, dz))
  const tx = dx / width, tz = dz / width
  const normal = { x: -tz * plot.side, z: tx * plot.side }
  return [
    { ...plot.frontageA },
    { ...plot.frontageB },
    { x: plot.frontageB.x + normal.x * plot.depth, z: plot.frontageB.z + normal.z * plot.depth },
    { x: plot.frontageA.x + normal.x * plot.depth, z: plot.frontageA.z + normal.z * plot.depth },
  ]
}

function roadCrossesPolygon(road: RoadPath, polygon: Point[]): boolean {
  for (const point of road.points) if (pointInPolygon(point, polygon)) return true
  for (let i = 1; i < road.points.length; i++) {
    for (let j = 0; j < polygon.length; j++) {
      if (segmentsIntersect(road.points[i - 1], road.points[i], polygon[j], polygon[(j + 1) % polygon.length])) return true
    }
  }
  return false
}

export function nearestFarmhouseForField(
  points: Point[],
  buildings: Building[],
  maxDistance = FIELD_FARMHOUSE_RADIUS,
): Building | null {
  if (points.length < 3) return null
  const center = fieldCentroid(points)
  return buildings
    .filter(building => building.type === 'farmhouse' && !building.destroyed)
    .map(building => ({ building, distance: Math.hypot(building.x - center.x, building.z - center.z) }))
    .filter(candidate => candidate.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance || a.building.id - b.building.id)[0]?.building ?? null
}

export function fieldPlacementError(
  points: Point[],
  existingFields: FieldPlot[],
  buildings: Building[],
  residentialPlots: ResidentialPlot[],
  nodes: ResourceNode[],
  roads: RoadPath[],
  half = 23,
): string | null {
  if (points.length < 3) return 'Place at least 3 field corners.'
  if (points.length > 8) return 'Fields support up to 8 corners in this slice.'
  if (points.some(point => !inBounds(point, half))) return 'Keep the whole field inside the settlement boundary.'
  if (!simpleFieldPolygon(points)) return 'Field edges cannot cross and corners need at least 0.75m spacing.'
  const area = fieldArea(points)
  if (area < 12) return 'Field is too small. Draw at least 12m².'
  if (area > 180) return 'Field is too large. Keep one field below 180m².'
  if (existingFields.some(field => polygonsOverlap(points, field.points))) return 'Fields cannot overlap.'
  if (buildings.some(building => polygonsOverlap(points, buildingCorners(building)))) return 'Field overlaps a building or blueprint.'
  if (residentialPlots.some(plot => polygonsOverlap(points, residentialCorners(plot)))) return 'Field overlaps a residential plot.'
  if (nodes.some(node => node.remaining > 0 && pointInPolygon(node, points))) return 'Clear trees, food bushes and ore deposits from the field first.'
  if (roads.some(road => roadCrossesPolygon(road, points))) return 'Field boundary cannot cross an existing road.'
  if (!nearestFarmhouseForField(points, buildings)) {
    return 'Field needs a Farmhouse within ' + FIELD_FARMHOUSE_RADIUS + 'm.'
  }
  return null
}

export function createField(id: number, points: Point[], farmhouseId: number | null = null): FieldPlot {
  const center = fieldCentroid(points)
  const area = fieldArea(points)
  return {
    id,
    x: center.x,
    z: center.z,
    points: points.map(point => ({ ...point })),
    area,
    yield: Math.max(8, Math.min(60, Math.round(area * 0.55))),
    phase: 'fallow',
    work: 0,
    growthDays: 0,
    lastGrowthDay: 0,
    farmhouseId,
  }
}

export function pointInField(point: Point, field: FieldPlot): boolean {
  return pointInPolygon(point, field.points)
}

export function residentialPlotFieldError(
  preview: { frontageA: Point; frontageB: Point; depth: number; side: 1 | -1 } | null,
  fields: FieldPlot[],
): string | null {
  if (!preview) return null
  const dx = preview.frontageB.x - preview.frontageA.x
  const dz = preview.frontageB.z - preview.frontageA.z
  const width = Math.max(EPSILON, Math.hypot(dx, dz))
  const tx = dx / width, tz = dz / width
  const normal = { x: -tz * preview.side, z: tx * preview.side }
  const polygon = [
    preview.frontageA,
    preview.frontageB,
    { x: preview.frontageB.x + normal.x * preview.depth, z: preview.frontageB.z + normal.z * preview.depth },
    { x: preview.frontageA.x + normal.x * preview.depth, z: preview.frontageA.z + normal.z * preview.depth },
  ]
  return fields.some(field => polygonsOverlap(polygon, field.points)) ? 'Residential plot overlaps a farm field.' : null
}
