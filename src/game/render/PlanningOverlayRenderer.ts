import { BUILDINGS, type BuildingId } from '../data/buildings'
import type { Building, Point, ResidentialPlot } from '../model/WorldState'
import { plotCorners } from '../world/TownPlanning'
import type { FieldInstanceFn } from './FieldRenderer'
import type { RotateOffset } from './PlacementGhostRenderer'

export class PlanningOverlayRenderer {
  constructor(
    private readonly instanceFn: FieldInstanceFn,
    private readonly rotateOffset: RotateOffset,
  ) {}

  private renderPlanSegment(a: Point, b: Point, width = 0.07, color = 0xe8dfc4, y = 0.09): void {
    const dx = b.x - a.x
    const dz = b.z - a.z
    const length = Math.max(0.02, Math.hypot(dx, dz))
    this.instanceFn(
      'planningGuide',
      (a.x + b.x) / 2,
      y,
      (a.z + b.z) / 2,
      width,
      0.035,
      length,
      color,
      Math.atan2(dx, dz),
    )
  }

  private renderDashedPlanSegment(
    a: Point,
    b: Point,
    color = 0xe8dfc4,
    dash = 0.62,
    gap = 0.34,
    width = 0.07,
    y = 0.09,
  ): void {
    const dx = b.x - a.x
    const dz = b.z - a.z
    const length = Math.hypot(dx, dz)
    if (length < 0.04) return
    const ux = dx / length
    const uz = dz / length
    for (let offset = 0; offset < length; offset += dash + gap) {
      const end = Math.min(length, offset + dash)
      this.renderPlanSegment(
        { x: a.x + ux * offset, z: a.z + uz * offset },
        { x: a.x + ux * end, z: a.z + uz * end },
        width,
        color,
        y,
      )
    }
  }

  private renderPlanHouseIcon(center: Point, rotation: number, scale = 1, color = 0xf4e7bd, y = 0.115): void {
    const local = (x: number, z: number): Point => {
      const offset = this.rotateOffset(x * scale, z * scale, rotation)
      return { x: center.x + offset.x, z: center.z + offset.z }
    }
    const half = 0.42
    const front = 0.38
    const rear = -0.3
    this.renderPlanSegment(local(-half, rear), local(-half, front), 0.08, color, y)
    this.renderPlanSegment(local(half, rear), local(half, front), 0.08, color, y)
    this.renderPlanSegment(local(-half, rear), local(half, rear), 0.08, color, y)
    this.renderPlanSegment(local(-half, front), local(0, front + 0.34), 0.08, color, y)
    this.renderPlanSegment(local(0, front + 0.34), local(half, front), 0.08, color, y)
    this.renderPlanSegment(local(-0.12, rear), local(-0.12, rear + 0.3), 0.07, color, y)
    this.renderPlanSegment(local(0.12, rear), local(0.12, rear + 0.3), 0.07, color, y)
  }

  private renderPlanExtensionIcon(center: Point, rotation: number, scale = 1, color = 0xd7c99c, y = 0.112): void {
    const local = (x: number, z: number): Point => {
      const offset = this.rotateOffset(x * scale, z * scale, rotation)
      return { x: center.x + offset.x, z: center.z + offset.z }
    }
    const half = 0.3
    this.renderPlanSegment(local(-half, -half), local(half, -half), 0.065, color, y)
    this.renderPlanSegment(local(half, -half), local(half, half), 0.065, color, y)
    this.renderPlanSegment(local(half, half), local(-half, half), 0.065, color, y)
    this.renderPlanSegment(local(-half, half), local(-half, -half), 0.065, color, y)
    this.renderPlanSegment(local(-0.18, 0), local(0.18, 0), 0.06, color, y)
    this.renderPlanSegment(local(0, -0.18), local(0, 0.18), 0.06, color, y)
  }

  renderResidentialPlanningOverlay(
    plot: Pick<ResidentialPlot, 'frontageA' | 'frontageB' | 'depth' | 'side' | 'angle'>,
    housePoint: Point,
    markerSeed = 0,
  ): void {
    const corners = plotCorners(plot)
    const [frontA, frontB, rearB, rearA] = corners
    for (const [a, b] of [[frontA, frontB], [frontB, rearB], [rearB, rearA], [rearA, frontA]] as const) {
      this.renderDashedPlanSegment(a, b, 0xe7dec1, 0.58, 0.34, 0.075, 0.095)
    }
    for (const corner of corners) {
      this.instanceFn('planningMarker', corner.x, 0.102, corner.z, 1, 1, 1, 0xf2e7c4, markerSeed * 0.07)
    }

    const frontageLength = Math.max(0.001, Math.hypot(frontB.x - frontA.x, frontB.z - frontA.z))
    const tangent = { x: (frontB.x - frontA.x) / frontageLength, z: (frontB.z - frontA.z) / frontageLength }
    const rear = { x: -tangent.z * plot.side, z: tangent.x * plot.side }
    const frontMid = { x: (frontA.x + frontB.x) / 2, z: (frontA.z + frontB.z) / 2 }
    const houseBack = Math.min(plot.depth - 1.4, Math.max(3.0, plot.depth * 0.48))
    const dividerA = { x: frontA.x + rear.x * houseBack, z: frontA.z + rear.z * houseBack }
    const dividerB = { x: frontB.x + rear.x * houseBack, z: frontB.z + rear.z * houseBack }
    this.renderDashedPlanSegment(dividerA, dividerB, 0xd5c69a, 0.46, 0.32, 0.055, 0.092)

    this.renderPlanHouseIcon(housePoint, plot.angle, 0.95)

    const rearMid = {
      x: frontMid.x + rear.x * Math.max(houseBack + 1.0, plot.depth * 0.77),
      z: frontMid.z + rear.z * Math.max(houseBack + 1.0, plot.depth * 0.77),
    }
    this.renderPlanExtensionIcon(rearMid, plot.angle, 0.9)
  }

  private renderPlanBuildingIcon(type: BuildingId, center: Point, rotation: number, color = 0xf1e2b7): void {
    if (type === 'farmhouse' || type === 'tavern') {
      this.renderPlanHouseIcon(center, rotation, type === 'farmhouse' ? 0.92 : 0.82, color)
      if (type === 'tavern') {
        const sign = this.rotateOffset(0.58, 0.2, rotation)
        const signCenter = { x: center.x + sign.x, z: center.z + sign.z }
        const top = this.rotateOffset(0, 0.24, rotation)
        const bottom = this.rotateOffset(0, -0.24, rotation)
        this.renderPlanSegment(
          { x: signCenter.x + bottom.x, z: signCenter.z + bottom.z },
          { x: signCenter.x + top.x, z: signCenter.z + top.z },
          0.055,
          color,
          0.116,
        )
      }
      return
    }

    const local = (x: number, z: number): Point => {
      const offset = this.rotateOffset(x, z, rotation)
      return { x: center.x + offset.x, z: center.z + offset.z }
    }

    if (type === 'campfire') {
      const radius = 0.38
      const ring: Point[] = []
      for (let i = 0; i < 8; i++) {
        const angle = i / 8 * Math.PI * 2
        ring.push(local(Math.cos(angle) * radius, Math.sin(angle) * radius))
      }
      for (let i = 0; i < ring.length; i++) {
        this.renderPlanSegment(ring[i], ring[(i + 1) % ring.length], 0.055, color, 0.116)
      }
      this.renderPlanSegment(local(-0.24, -0.2), local(0.24, 0.2), 0.06, color, 0.117)
      this.renderPlanSegment(local(0.24, -0.2), local(-0.24, 0.2), 0.06, color, 0.117)
      return
    }

    if (type === 'guard-post') {
      this.renderPlanSegment(local(-0.32, -0.3), local(0.32, -0.3), 0.065, color, 0.116)
      this.renderPlanSegment(local(-0.32, -0.3), local(-0.32, 0.34), 0.065, color, 0.116)
      this.renderPlanSegment(local(0.32, -0.3), local(0.32, 0.34), 0.065, color, 0.116)
      this.renderPlanSegment(local(-0.32, 0.34), local(0.32, 0.34), 0.065, color, 0.116)
      this.renderPlanSegment(local(0, -0.12), local(0, 0.55), 0.055, color, 0.117)
      this.renderPlanSegment(local(0, 0.55), local(0.28, 0.42), 0.055, color, 0.117)
      return
    }

    if (type === 'market' || type === 'trading-post') {
      const half = type === 'market' ? 0.46 : 0.42
      this.renderPlanSegment(local(-half, -0.28), local(-half, 0.3), 0.06, color, 0.116)
      this.renderPlanSegment(local(half, -0.28), local(half, 0.3), 0.06, color, 0.116)
      this.renderPlanSegment(local(-half, 0.3), local(half, 0.3), 0.075, color, 0.116)
      this.renderPlanSegment(local(-half - 0.08, 0.12), local(half + 0.08, 0.12), 0.055, color, 0.116)
      if (type === 'trading-post') {
        this.renderPlanSegment(local(-0.22, -0.08), local(0.22, -0.08), 0.06, color, 0.117)
        this.renderPlanSegment(local(0.22, -0.08), local(0.08, -0.22), 0.06, color, 0.117)
      }
      return
    }

    if (type === 'brewery') {
      this.renderPlanSegment(local(-0.34, -0.32), local(0.22, -0.32), 0.065, color, 0.116)
      this.renderPlanSegment(local(-0.34, -0.32), local(-0.34, 0.34), 0.065, color, 0.116)
      this.renderPlanSegment(local(-0.34, 0.34), local(0.22, 0.34), 0.065, color, 0.116)
      this.renderPlanSegment(local(0.22, 0.34), local(0.22, -0.32), 0.065, color, 0.116)
      this.renderPlanSegment(local(0.22, 0.2), local(0.48, 0.12), 0.055, color, 0.116)
      this.renderPlanSegment(local(0.48, 0.12), local(0.22, -0.04), 0.055, color, 0.116)
      return
    }

    if (type === 'blacksmith') {
      this.renderPlanSegment(local(-0.42, 0.2), local(0.42, 0.2), 0.075, color, 0.116)
      this.renderPlanSegment(local(-0.18, 0.2), local(-0.05, -0.02), 0.065, color, 0.116)
      this.renderPlanSegment(local(0.18, 0.2), local(0.05, -0.02), 0.065, color, 0.116)
      this.renderPlanSegment(local(-0.05, -0.02), local(0.05, -0.02), 0.07, color, 0.116)
      this.renderPlanSegment(local(0, -0.02), local(0, -0.38), 0.075, color, 0.116)
      this.renderPlanSegment(local(-0.24, -0.38), local(0.24, -0.38), 0.075, color, 0.116)
      return
    }

    this.renderPlanExtensionIcon(center, rotation, 1.08, color)
  }

  private renderPlanFrontage(center: Point, rotation: number, footprint: number, color = 0xf5d78e): void {
    const local = (x: number, z: number): Point => {
      const offset = this.rotateOffset(x, z, rotation)
      return { x: center.x + offset.x, z: center.z + offset.z }
    }
    const half = footprint / 2
    const gateHalf = Math.min(0.62, Math.max(0.36, footprint * 0.18))
    const frontZ = half + 0.08
    this.renderPlanSegment(local(-gateHalf, frontZ), local(gateHalf, frontZ), 0.105, color, 0.121)
    this.renderPlanSegment(local(0, frontZ), local(0, frontZ + 0.42), 0.07, color, 0.122)
    this.renderPlanSegment(local(0, frontZ + 0.42), local(-0.16, frontZ + 0.24), 0.07, color, 0.122)
    this.renderPlanSegment(local(0, frontZ + 0.42), local(0.16, frontZ + 0.24), 0.07, color, 0.122)
  }

  renderBuildingPlanningOverlay(b: Building, rotation: number): void {
    const footprint = BUILDINGS[b.type].footprint
    const half = footprint / 2
    const corner = (x: number, z: number): Point => {
      const offset = this.rotateOffset(x, z, rotation)
      return { x: b.x + offset.x, z: b.z + offset.z }
    }
    const corners = [
      corner(-half, -half),
      corner(half, -half),
      corner(half, half),
      corner(-half, half),
    ]

    this.instanceFn('planningFill', b.x, 0.047, b.z, footprint * 0.94, 1, footprint * 0.94, 0xb8ae82, rotation)

    for (let i = 0; i < corners.length; i++) {
      this.renderDashedPlanSegment(corners[i], corners[(i + 1) % corners.length], 0xe6dcc0, 0.52, 0.3, 0.065, 0.095)
      this.instanceFn('planningMarker', corners[i].x, 0.102, corners[i].z, 0.82, 1, 0.82, 0xf0e3bf)
    }

    this.renderPlanBuildingIcon(b.type, b, rotation)
    this.renderPlanFrontage(b, rotation, footprint)
  }


}
