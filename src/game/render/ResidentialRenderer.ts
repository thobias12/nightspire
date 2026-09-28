import * as THREE from 'three'
import type { Building, Point, ResidentialPlot } from '../model/WorldState'
import { residentialPresentationProfile, type ResidentialPresentationProfile } from './ResidentialPresentation'
import { plotCorners, residentialPlotWidth } from '../world/TownPlanning'
import type { FieldInstanceFn } from './FieldRenderer'
import type { RotateOffset } from './PlacementGhostRenderer'
import type { PlanningOverlayRenderer } from './PlanningOverlayRenderer'

export type ReadableNightColorFn = (color: number, night: number) => number

/**
 * Residential plots, lot boundaries, street thresholds and backyard compounds.
 */
export class ResidentialRenderer {
  constructor(
    private readonly instanceFn: FieldInstanceFn,
    private readonly rotateOffset: RotateOffset,
    private readonly planningOverlays: PlanningOverlayRenderer,
    private readonly readableNightColorFn: ReadableNightColorFn,
  ) {}

  private samePlotPoint(a: Point, b: Point, epsilon = 0.08): boolean {
    return Math.hypot(a.x - b.x, a.z - b.z) <= epsilon
  }

  private sharedSideNeighbor(plot: ResidentialPlot, endpoint: Point, plots: ResidentialPlot[]): ResidentialPlot | null {
    return plots
      .filter(candidate =>
        candidate.id !== plot.id
        && candidate.roadId === plot.roadId
        && candidate.side === plot.side
        && (this.samePlotPoint(candidate.frontageA, endpoint) || this.samePlotPoint(candidate.frontageB, endpoint))
      )
      .sort((a, b) => a.id - b.id)[0] ?? null
  }

  private renderFenceWorld(a: Point, b: Point, seed: number, rear = false): void {
    const dx = b.x - a.x
    const dz = b.z - a.z
    const length = Math.hypot(dx, dz)
    if (length < 0.35) return

    const ux = dx / length
    const uz = dz / length
    // Timber rails are scaled along their local X axis. Use the segment's actual
    // world direction instead of the road-style local-Z heading used by road strips.
    const rotation = Math.atan2(-uz, ux)
    const midX = (a.x + b.x) / 2
    const midZ = (a.z + b.z) / 2
    const gap = rear ? Math.min(0.8, length * 0.18) : 0
    const railLength = Math.max(0.25, length - gap)

    // Rear fences get a small gate-like opening; side fences stay continuous.
    if (gap > 0.15) {
      const half = railLength / 2
      const offset = gap / 2 + half / 2
      for (const sign of [-1, 1]) {
        const cx = midX + ux * offset * sign
        const cz = midZ + uz * offset * sign
        this.instanceFn('timber', cx, 0.38, cz, half, 0.07, 0.08, 0x59402e, rotation)
        this.instanceFn('timber', cx, 0.68, cz, half, 0.065, 0.075, 0x59402e, rotation)
      }
    } else {
      this.instanceFn('timber', midX, 0.38, midZ, railLength, 0.07, 0.08, 0x59402e, rotation)
      this.instanceFn('timber', midX, 0.68, midZ, railLength, 0.065, 0.075, 0x59402e, rotation)
    }

    const perpendicularX = -uz
    const perpendicularZ = ux
    const postCount = Math.max(2, Math.min(5, Math.round(length / 2.1) + 1))
    for (let i = 0; i < postCount; i++) {
      const t = postCount === 1 ? 0.5 : i / (postCount - 1)
      if (rear && Math.abs(t - 0.5) < 0.12) continue
      const jitter = i > 0 && i < postCount - 1 ? Math.sin(seed * 1.71 + i * 2.33) * 0.045 : 0
      const x = a.x + dx * t + perpendicularX * jitter
      const z = a.z + dz * t + perpendicularZ * jitter
      const height = 0.72 + ((seed + i) % 3) * 0.06
      this.instanceFn('timber', x, height / 2, z, 0.09, height, 0.09, i % 3 === 0 ? 0x4c382a : 0x463326, rotation)
    }
  }

  private plotCenter(plot: ResidentialPlot): Point {
    const frontageMid = {
      x: (plot.frontageA.x + plot.frontageB.x) / 2,
      z: (plot.frontageA.z + plot.frontageB.z) / 2,
    }
    const rear = this.rotateOffset(0, -plot.depth / 2, plot.angle)
    return { x: frontageMid.x + rear.x, z: frontageMid.z + rear.z }
  }

  residentialDoorOffset(profile: ResidentialPresentationProfile, seed: number, width: number): number {
    if (profile.form === 'wide-deep') return -profile.sidePassage * Math.min(0.82, width * 0.2)
    if (profile.form === 'long-burgage') return -profile.sidePassage * Math.min(0.42, width * 0.16)
    if (profile.form === 'wide-shallow') return (seed % 2 === 0 ? -1 : 1) * Math.min(0.66, width * 0.16)
    return ((seed % 3) - 1) * Math.min(profile.tier === 'homestead' ? 0.52 : 0.4, width * 0.17)
  }

  residentialVisualPlacement(
    b: Building,
    plot: ResidentialPlot,
    profile: ResidentialPresentationProfile,
  ): { visualB: Building; doorX: number; frontClearance: number; localX: number } {
    const width = profile.houseWidth
    const depth = profile.houseDepth
    const center = this.plotCenter(plot)
    const right = this.rotateOffset(1, 0, plot.angle)
    const towardRoad = this.rotateOffset(0, 1, plot.angle)
    const frontMid = {
      x: (plot.frontageA.x + plot.frontageB.x) / 2,
      z: (plot.frontageA.z + plot.frontageB.z) / 2,
    }

    const bLocalX = (b.x - center.x) * right.x + (b.z - center.z) * right.z
    const safeHalfWidth = Math.max(0, residentialPlotWidth(plot) / 2 - width / 2 - 0.3)
    const desiredLocalX = bLocalX + profile.lateralOffset
    const clampedLocalX = THREE.MathUtils.clamp(desiredLocalX, -safeHalfWidth, safeHalfWidth)
    const lateralOffset = clampedLocalX - bLocalX

    const frontDistance = (frontMid.x - b.x) * towardRoad.x + (frontMid.z - b.z) * towardRoad.z
    const maxFrontageOffset = frontDistance - depth / 2 - 0.34
    const frontageOffset = Math.min(profile.frontageOffset, maxFrontageOffset)
    const visualOffset = this.rotateOffset(lateralOffset, frontageOffset, plot.angle)
    const visualB = { ...b, x: b.x + visualOffset.x, z: b.z + visualOffset.z }
    const frontClearance = Math.max(0, frontDistance - frontageOffset - depth / 2)

    return {
      visualB,
      doorX: this.residentialDoorOffset(profile, plot.id, width),
      frontClearance,
      localX: clampedLocalX,
    }
  }

  renderResidentialPlot(plot: ResidentialPlot, b: Building, night: number, plots: ResidentialPlot[]): void {
    const width = residentialPlotWidth(plot)
    const profile = residentialPresentationProfile(plot)
    const center = this.plotCenter(plot)
    const halfW = width / 2
    const halfD = plot.depth / 2
    this.instanceFn('plotGround', center.x, 0.021, center.z, width * 0.94, 1, plot.depth * 0.94, plot.id % 2 ? 0x6a5a42 : 0x62543d, plot.angle)

    const corners = plotCorners(plot)
    const [frontA, frontB, rearB, rearA] = corners
    if (!b.complete && !b.destroyed) this.planningOverlays.renderResidentialPlanningOverlay(plot, b, plot.id)
    const neighborA = this.sharedSideNeighbor(plot, plot.frontageA, plots)
    const neighborB = this.sharedSideNeighbor(plot, plot.frontageB, plots)

    // A shared side boundary belongs to the lower plot id, so adjacent plots never
    // double-render the same rails/posts. If one plot is deeper, the owner extends
    // the boundary to the deeper rear edge.
    if (!neighborA || plot.id < neighborA.id) {
      const depth = Math.max(plot.depth, neighborA?.depth ?? plot.depth)
      const sideARear = {
        x: frontA.x + (rearA.x - frontA.x) / plot.depth * depth,
        z: frontA.z + (rearA.z - frontA.z) / plot.depth * depth,
      }
      const startT = Math.min(0.32, profile.frontGap / Math.max(0.1, depth))
      const sideAStart = {
        x: frontA.x + (sideARear.x - frontA.x) * startT,
        z: frontA.z + (sideARear.z - frontA.z) * startT,
      }
      this.renderFenceWorld(sideAStart, sideARear, plot.id * 3 + 1)
    }
    if (!neighborB || plot.id < neighborB.id) {
      const depth = Math.max(plot.depth, neighborB?.depth ?? plot.depth)
      const sideBRear = {
        x: frontB.x + (rearB.x - frontB.x) / plot.depth * depth,
        z: frontB.z + (rearB.z - frontB.z) / plot.depth * depth,
      }
      const startT = Math.min(0.32, profile.frontGap / Math.max(0.1, depth))
      const sideBStart = {
        x: frontB.x + (sideBRear.x - frontB.x) * startT,
        z: frontB.z + (sideBRear.z - frontB.z) * startT,
      }
      this.renderFenceWorld(sideBStart, sideBRear, plot.id * 3 + 2)
    }
    this.renderFenceWorld(rearA, rearB, plot.id * 3 + 3, true)

    // Some exposed outer boundaries become hedge/fence mixes instead of perfect
    // rectangular rails, keeping the lot rules clear without a modern parcel look.
    if (!neighborB && plot.id % 2 === 0) {
      const dx = rearB.x - frontB.x
      const dz = rearB.z - frontB.z
      for (let i = 1; i <= 3; i++) {
        const t = i / 4
        this.instanceFn(
          'underbrush',
          frontB.x + dx * t + Math.sin(plot.id + i) * 0.08,
          0.2,
          frontB.z + dz * t + Math.cos(plot.id * 0.7 + i) * 0.08,
          0.4,
          0.34,
          0.4,
          0x526748,
          plot.id * 0.17 + i,
        )
      }
    }

    if (!b.complete || b.destroyed) return

    // Narrow worn footpath from the road frontage to the *visual* front door.
    // M3.9 presentation offsets are renderer-only, so deriving the path from the
    // persisted building anchor can visibly miss the house or clip a frontage fence.
    const frontMid = {
      x: (plot.frontageA.x + plot.frontageB.x) / 2,
      z: (plot.frontageA.z + plot.frontageB.z) / 2,
    }
    const placement = this.residentialVisualPlacement(b, plot, profile)
    const door = this.rotateOffset(placement.doorX, profile.houseDepth / 2 + 0.2, plot.angle)
    const doorPoint = { x: placement.visualB.x + door.x, z: placement.visualB.z + door.z }
    const pathDx = doorPoint.x - frontMid.x
    const pathDz = doorPoint.z - frontMid.z
    const pathLength = Math.hypot(pathDx, pathDz)
    if (pathLength > 0.6) {
      this.instanceFn(
        'roadShoulder',
        (frontMid.x + doorPoint.x) / 2,
        0.023,
        (frontMid.z + doorPoint.z) / 2,
        0.42,
        1,
        Math.max(0.45, pathLength - 0.16),
        0x8e7958,
        Math.atan2(pathDx, pathDz),
      )
    }

    const rearZ = -halfD + Math.min(2.3, plot.depth * 0.22)
    if (plot.backyard === 'garden') {
      const rowCount = Math.max(2, Math.min(4, Math.floor(width / 1.6)))
      for (let i = 0; i < rowCount; i++) {
        const localX = (i - (rowCount - 1) / 2) * Math.min(1.2, width / Math.max(3, rowCount))
        const p = this.rotateOffset(localX, rearZ, plot.angle)
        this.instanceFn('gardenRow', center.x + p.x, 0.07, center.z + p.z, 0.52, 1, Math.min(2.4, plot.depth * 0.28), i % 2 ? 0x59653f : 0x657048, plot.angle)
        for (let j = 0; j < 3; j++) {
          const plant = this.rotateOffset(localX + (j - 1) * 0.12, rearZ - 0.55 + j * 0.48, plot.angle)
          this.instanceFn('underbrush', center.x + plant.x, 0.18, center.z + plant.z, 0.28, 0.24, 0.28, 0x58714a, plot.id * 0.13 + i + j)
        }
      }
      const basket = this.rotateOffset(Math.min(halfW - 0.45, 1.2), rearZ + 0.85, plot.angle)
      this.instanceFn('baskets', center.x + basket.x, 0.2, center.z + basket.z, 0.5, 0.68, 0.5, 0x9b7546, plot.angle)
    } else if (plot.backyard === 'chickens') {
      const penCenter = this.rotateOffset(0, rearZ, plot.angle)
      for (let i = 0; i < 5; i++) {
        const px = ((i % 3) - 1) * 0.42 + Math.sin(plot.id + i) * 0.09
        const pz = (Math.floor(i / 3) - 0.25) * 0.46
        const p = this.rotateOffset(px, rearZ + pz, plot.angle)
        this.instanceFn('chicken', center.x + p.x, 0.17, center.z + p.z, 1, 0.86, 1, i % 2 ? 0xc5ad7a : 0x9d815e, i * 0.7)
      }
      this.instanceFn('timber', center.x + penCenter.x, 0.28, center.z + penCenter.z, Math.min(2.4, width * 0.55), 0.55, 0.08, 0x60452f, plot.angle)
      const coop = this.rotateOffset(-Math.min(halfW - 0.52, 1.05), rearZ - 0.65, plot.angle)
      this.instanceFn('timber', center.x + coop.x, 0.38, center.z + coop.z, 0.82, 0.68, 0.72, 0x654832, plot.angle)
      this.instanceFn('gableRoofs', center.x + coop.x, 0.7, center.z + coop.z, 1.02, 0.42, 0.9, this.readableNightColorFn(0x6a553d, night), plot.angle)
    } else if (plot.backyard === 'workyard') {
      const shed = this.rotateOffset(-Math.min(halfW - 0.8, 1.25), rearZ, plot.angle)
      this.instanceFn('timber', center.x + shed.x, 0.48, center.z + shed.z, 1.15, 0.9, 0.95, 0x674a35, plot.angle)
      this.instanceFn('gableRoofs', center.x + shed.x, 0.92, center.z + shed.z, 1.42, 0.56, 1.15, this.readableNightColorFn(0x69543b, night), plot.angle)
      for (let i = 0; i < 4; i++) {
        const log = this.rotateOffset(0.45 + (i % 2) * 0.34, rearZ - 0.4 + Math.floor(i / 2) * 0.34, plot.angle)
        this.instanceFn('logs', center.x + log.x, 0.18 + (i % 2) * 0.06, center.z + log.z, 0.5, 0.5, 0.5, 0x6a482f, plot.angle)
      }
    } else {
      for (let i = 0; i < 8; i++) {
        const log = this.rotateOffset(-0.78 + (i % 4) * 0.42, rearZ - 0.35 + Math.floor(i / 4) * 0.35, plot.angle)
        this.instanceFn('logs', center.x + log.x, 0.18 + (i % 2) * 0.06, center.z + log.z, 0.56, 0.56, 0.56, 0x6b4930, plot.angle)
      }
      const chopping = this.rotateOffset(Math.min(halfW - 0.45, 1.25), rearZ + 0.5, plot.angle)
      this.instanceFn('logs', center.x + chopping.x, 0.22, center.z + chopping.z, 0.45, 0.42, 0.45, 0x5f422e, plot.angle + Math.PI / 2)
      this.instanceFn('metal', center.x + chopping.x, 0.48, center.z + chopping.z, 0.42, 0.06, 0.08, 0x596168, plot.angle + 0.3)
    }

    if (plot.id % 3 === 0) {
      const water = this.rotateOffset(-Math.min(halfW - 0.4, 1.2), rearZ + 1.0, plot.angle)
      this.instanceFn('barrels', center.x + water.x, 0.29, center.z + water.z, 0.36, 0.58, 0.36, 0x725036, plot.angle)
    }

    this.renderResidentialCompoundOutbuildings(plot, b, profile, center, width, night)
    this.renderResidentialStreetThreshold(plot, profile, center, width)
  }

  private renderResidentialStreetThreshold(
    plot: ResidentialPlot,
    profile: ResidentialPresentationProfile,
    center: Point,
    width: number,
  ): void {
    const halfW = width / 2
    const halfD = plot.depth / 2
    const frontZ = halfD - 0.18
    const cornerInset = Math.min(0.78, Math.max(0.42, width * 0.09))

    // A side passage is a visible working entrance rather than merely an empty strip.
    if (profile.sidePassage !== 0) {
      const passageX = profile.sidePassage * (halfW - 0.34)
      const passage = this.rotateOffset(passageX, frontZ - 0.28, plot.angle)
      this.instanceFn('roadShoulder', center.x + passage.x, 0.023, center.z + passage.z, 0.44, 1, 1.2, 0x8b7657, plot.angle)

      for (const gateSide of [-1, 1] as const) {
        const post = this.rotateOffset(passageX + gateSide * 0.29, frontZ - 0.02, plot.angle)
        this.instanceFn('timber', center.x + post.x, 0.48, center.z + post.z, 0.1, 0.96, 0.1, 0x4d3829, plot.angle)
      }
      const lintel = this.rotateOffset(passageX, frontZ - 0.02, plot.angle)
      this.instanceFn('timber', center.x + lintel.x, 0.92, center.z + lintel.z, 0.72, 0.08, 0.09, 0x5c412e, plot.angle)

      const service = this.rotateOffset(
        passageX - profile.sidePassage * 0.48,
        frontZ - 0.76,
        plot.angle,
      )
      if (plot.id % 2 === 0) {
        this.instanceFn('barrels', center.x + service.x, 0.28, center.z + service.z, 0.34, 0.56, 0.34, 0x725036, plot.angle)
      } else {
        for (let i = 0; i < 3; i++) {
          const log = this.rotateOffset(
            passageX - profile.sidePassage * 0.48,
            frontZ - 0.72 - i * 0.26,
            plot.angle,
          )
          this.instanceFn('logs', center.x + log.x, 0.16 + i * 0.03, center.z + log.z, 0.46, 0.44, 0.44, 0x67462f, plot.angle)
        }
      }
    }

    if (profile.frontageStyle === 'open') return

    const gateHalf = Math.min(0.82, Math.max(0.56, width * 0.1))
    const addPost = (localX: number, height = 0.82) => {
      const p = this.rotateOffset(localX, frontZ, plot.angle)
      this.instanceFn('timber', center.x + p.x, height / 2, center.z + p.z, 0.09, height, 0.09, 0x4d3829, plot.angle)
    }
    const addHedge = (localX: number, scale = 0.65) => {
      const p = this.rotateOffset(localX, frontZ - 0.04, plot.angle)
      this.instanceFn('underbrush', center.x + p.x, 0.18, center.z + p.z, scale, 0.34, 0.44, 0x536a4b, plot.id * 0.29 + localX)
    }

    if (profile.frontageStyle === 'posts') {
      addPost(-gateHalf)
      addPost(gateHalf)
      return
    }

    if (profile.frontageStyle === 'hedge') {
      for (const side of [-1, 1] as const) {
        addHedge(side * Math.min(halfW - 0.55, gateHalf + 0.62), profile.tier === 'cottage' ? 0.62 : 0.78)
      }
      return
    }

    if (profile.frontageStyle === 'short-fence') {
      for (const side of [-1, 1] as const) {
        const segmentCenter = side * (gateHalf + Math.max(0.5, (halfW - gateHalf) * 0.48))
        const segmentLength = Math.max(0.5, halfW - gateHalf - 0.28)
        const p = this.rotateOffset(segmentCenter, frontZ, plot.angle)
        this.instanceFn('timber', center.x + p.x, 0.38, center.z + p.z, segmentLength, 0.07, 0.08, 0x59402e, plot.angle)
        this.instanceFn('timber', center.x + p.x, 0.67, center.z + p.z, segmentLength, 0.065, 0.075, 0x59402e, plot.angle)
        addPost(side * gateHalf)
      }
      return
    }

    // Gate style: stronger posts, short hedge shoulders and a simple overhead beam.
    for (const side of [-1, 1] as const) {
      addPost(side * gateHalf, 1.0)
      addHedge(side * Math.min(halfW - 0.48, gateHalf + 0.72), 0.68)
    }
    const lintel = this.rotateOffset(0, frontZ, plot.angle)
    this.instanceFn('timber', center.x + lintel.x, 0.94, center.z + lintel.z, gateHalf * 2 + 0.18, 0.08, 0.09, 0x58402f, plot.angle)
  }

  private renderResidentialCompoundOutbuildings(
    plot: ResidentialPlot,
    b: Building,
    profile: ResidentialPresentationProfile,
    center: Point,
    width: number,
    night: number,
  ): void {
    const halfW = width / 2
    const halfD = plot.depth / 2
    const defaultSide: 1 | -1 = plot.id % 2 === 0 ? 1 : -1
    const buildSide: 1 | -1 = profile.sidePassage === 0 ? defaultSide : (profile.sidePassage === 1 ? -1 : 1)
    const rearZ = -halfD + Math.max(1.0, 1.18 * profile.outbuildingScale)
    const freeWidth = Math.max(0.9, halfW - 0.45)

    const renderServiceStructure = (
      localX: number,
      localZ: number,
      structureWidth: number,
      structureDepth: number,
      variant: ResidentialPresentationProfile['rearStructure'],
      seed: number,
      structureRotation = plot.angle,
    ) => {
      const p = this.rotateOffset(localX, localZ, plot.angle)
      const x = center.x + p.x
      const z = center.z + p.z
      const roofColor = this.readableNightColorFn(seed % 2 ? 0x66513e : 0x705b40, night)

      if (variant === 'lean-to') {
        for (const sx of [-structureWidth * 0.42, structureWidth * 0.42]) {
          const post = this.rotateOffset(localX + sx, localZ, plot.angle)
          this.instanceFn('timber', center.x + post.x, 0.46, center.z + post.z, 0.08, 0.92, 0.08, 0x4e3728, structureRotation)
        }
        this.instanceFn('cloth', x, 0.92, z, structureWidth + 0.16, 0.08, structureDepth + 0.16, 0x725b43, structureRotation)
        this.instanceFn('barrels', x, 0.26, z, 0.32, 0.52, 0.32, 0x705035, structureRotation)
        return
      }

      if (variant === 'covered-storage') {
        for (const sx of [-structureWidth * 0.4, structureWidth * 0.4]) {
          for (const sz of [-structureDepth * 0.34, structureDepth * 0.34]) {
            const post = this.rotateOffset(localX + sx, localZ + sz, plot.angle)
            this.instanceFn('timber', center.x + post.x, 0.5, center.z + post.z, 0.08, 1.0, 0.08, 0x4e3728, structureRotation)
          }
        }
        this.instanceFn('gableRoofs', x, 0.98, z, structureWidth + 0.3, 0.54, structureDepth + 0.3, roofColor, structureRotation)
        for (let i = 0; i < 3; i++) {
          this.instanceFn('barrels', x - 0.34 + i * 0.34, 0.26, z, 0.3, 0.52, 0.3, 0x725036, structureRotation)
        }
        return
      }

      if (variant === 'coop') {
        this.instanceFn('timber', x, 0.42, z, structureWidth * 0.8, 0.72, structureDepth * 0.78, 0x654832, structureRotation)
        this.instanceFn('gableRoofs', x, 0.78, z, structureWidth, 0.46, structureDepth, roofColor, structureRotation)
        for (let i = 0; i < 3; i++) {
          const chick = this.rotateOffset(localX + (i - 1) * 0.28, localZ + structureDepth * 0.62, plot.angle)
          this.instanceFn('chicken', center.x + chick.x, 0.17, center.z + chick.z, 1, 0.86, 1, i % 2 ? 0xc5ad7a : 0x9d815e, seed + i)
        }
        return
      }

      const plastered = variant === 'workshop'
      if (plastered) {
        this.instanceFn('stone', x, 0.12, z, structureWidth + 0.12, 0.24, structureDepth + 0.12, 0x67635b, structureRotation)
        this.instanceFn('plaster', x, 0.54, z, structureWidth, 0.86, structureDepth, seed % 2 ? 0x9d9077 : 0xa79a7d, structureRotation)
      } else {
        this.instanceFn('timber', x, 0.5, z, structureWidth, 0.9, structureDepth, seed % 2 ? 0x674a35 : 0x60442f, structureRotation)
      }
      this.instanceFn('gableRoofs', x, plastered ? 0.96 : 0.92, z, structureWidth + 0.34, plastered ? 0.58 : 0.54, structureDepth + 0.34, roofColor, structureRotation)

      if (plastered) {
        const bench = this.rotateOffset(localX, localZ + structureDepth * 0.66, plot.angle)
        this.instanceFn('timber', center.x + bench.x, 0.3, center.z + bench.z, Math.min(0.9, structureWidth * 0.72), 0.1, 0.28, 0x63462f, structureRotation)
        this.instanceFn('metal', center.x + bench.x + 0.2, 0.46, center.z + bench.z, 0.32, 0.05, 0.08, 0x626a70, structureRotation + 0.2)
      }
    }

    if (profile.form === 'compact') {
      if (plot.depth >= 8) {
        renderServiceStructure(buildSide * Math.min(freeWidth, 1.05), rearZ, 1, 0.92, profile.rearStructure, plot.id)
      }
      return
    }

    if (profile.form === 'long-burgage') {
      const shedX = buildSide * Math.min(freeWidth, 0.95)
      renderServiceStructure(shedX, rearZ - 0.15, 0.96, 1.34, profile.rearStructure, plot.id + 9)

      const laneSide = profile.sidePassage || -buildSide
      const laneX = laneSide * Math.min(halfW - 0.32, 1.45)
      const laneStart = this.rotateOffset(laneX, halfD - 0.45, plot.angle)
      const laneEnd = this.rotateOffset(laneX, rearZ + 0.42, plot.angle)
      const dx = laneEnd.x - laneStart.x
      const dz = laneEnd.z - laneStart.z
      this.instanceFn('roadShoulder', center.x + (laneStart.x + laneEnd.x) / 2, 0.024, center.z + (laneStart.z + laneEnd.z) / 2, 0.34, 1, Math.hypot(dx, dz), 0x897354, Math.atan2(dx, dz))

      const rearUtility = this.rotateOffset(buildSide * Math.min(halfW - 0.38, 1.05), rearZ + 1.08, plot.angle)
      this.instanceFn('barrels', center.x + rearUtility.x, 0.28, center.z + rearUtility.z, 0.32, 0.54, 0.32, 0x725036, plot.angle)
      return
    }

    if (profile.form !== 'wide-shallow') {
      const structureWidth = profile.form === 'wide-deep' ? Math.min(1.7, width * 0.22) : Math.min(1.4, width * 0.22)
      renderServiceStructure(
        buildSide * Math.min(freeWidth, halfW - structureWidth / 2 - 0.22),
        rearZ,
        structureWidth,
        profile.form === 'wide-deep' ? 1.42 : 1.12,
        profile.rearStructure,
        plot.id + 11,
      )
    }

    if (profile.form === 'wide-deep' && plot.depth >= 10) {
      const rearVariant = profile.courtyard === 'u' ? 'covered-storage' : (plot.id % 2 === 0 ? 'shed' : 'workshop')
      renderServiceStructure(
        0,
        rearZ - 0.42,
        Math.min(2.3, width * 0.28),
        1.12,
        rearVariant,
        plot.id + 23,
        plot.angle + Math.PI / 2,
      )
    }

    if (profile.sidePassage !== 0 && plot.depth >= 8.2) {
      const laneX = profile.sidePassage * Math.min(halfW - 0.32, profile.form === 'wide-deep' ? 1.8 : 1.45)
      const laneStart = this.rotateOffset(laneX, halfD - 0.45, plot.angle)
      const laneEnd = this.rotateOffset(laneX, rearZ + 0.5, plot.angle)
      const dx = laneEnd.x - laneStart.x
      const dz = laneEnd.z - laneStart.z
      this.instanceFn('roadShoulder', center.x + (laneStart.x + laneEnd.x) / 2, 0.024, center.z + (laneStart.z + laneEnd.z) / 2, profile.form === 'wide-deep' ? 0.42 : 0.36, 1, Math.hypot(dx, dz), 0x897354, Math.atan2(dx, dz))
    }

    const utility = this.rotateOffset(-buildSide * Math.min(halfW - 0.45, 1.25), rearZ + 0.82, plot.angle)
    if (profile.tier === 'burgage') {
      this.instanceFn('baskets', center.x + utility.x, 0.22, center.z + utility.z, 0.58, 0.74, 0.58, 0x967147, plot.angle)
      this.instanceFn('barrels', center.x + utility.x + 0.34, 0.28, center.z + utility.z + 0.12, 0.33, 0.56, 0.33, 0x725036, plot.angle)
    } else {
      this.instanceFn('sacks', center.x + utility.x, 0.22, center.z + utility.z, 0.42, 0.48, 0.38, 0x97845f, plot.angle)
    }
  }


}
