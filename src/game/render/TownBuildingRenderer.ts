import * as THREE from 'three'
import { BUILDINGS } from '../data/buildings'
import type { Building, Point, ResidentialPlot } from '../model/WorldState'
import { residentialPresentationProfile, type ResidentialPresentationProfile } from './ResidentialPresentation'
import { TOWN_PALETTE } from './TownPresentation'
import { plotCorners, residentialPlotWidth } from '../world/TownPlanning'
import type { FieldInstanceFn } from './FieldRenderer'
import type { RotateOffset } from './PlacementGhostRenderer'
import type { PlanningOverlayRenderer } from './PlanningOverlayRenderer'
import { ResidentialRenderer } from './ResidentialRenderer'

/**
 * Procedural town and building visual library.
 *
 * Owns residential compounds, building façades, props, nightlife figures and
 * fortification visuals. SceneRenderer keeps world orchestration and feeds this
 * renderer only low-level instance/rotation primitives.
 */
export class TownBuildingRenderer {
  private readonly scratchColor = new THREE.Color()
  private readonly warmGlow = new THREE.Color(0xffc36a)
  private readonly nightSurfaceLift = new THREE.Color(0x566a80)
  private readonly warmPropLift = new THREE.Color(0xb77a43)
  private readonly residentialRenderer: ResidentialRenderer

  constructor(
    private readonly instanceFn: FieldInstanceFn,
    private readonly rotateOffset: RotateOffset,
    private readonly planningOverlays: PlanningOverlayRenderer,
  ) {
    this.residentialRenderer = new ResidentialRenderer(
      this.instanceFn,
      this.rotateOffset,
      this.planningOverlays,
      (color, night) => this.readableNightColor(color, night),
    )
  }

  private warmWindow(
    x: number,
    y: number,
    z: number,
    rotation: number,
    night: number,
    width = 0.38,
    height = 0.48,
  ): void {
    if (night < 0.08) return
    const color = this.scratchColor.copy(this.warmGlow).multiplyScalar(0.55 + night * 0.45).getHex()
    this.instanceFn('windowHalo', x, y, z, width * 1.75, height * 1.55, 0.085, color, rotation)
    this.instanceFn('windowGlow', x, y, z, width, height, 0.06, color, rotation)
  }

  private framedWindow(
    x: number,
    y: number,
    z: number,
    rotation: number,
    night: number,
    width = 0.38,
    height = 0.48,
    seed = 0,
  ): void {
    this.warmWindow(x, y, z, rotation, night, width, height)
    const frameColor = seed % 3 === 0 ? 0x4a3427 : 0x553a29
    const sideOffset = width / 2 + 0.055
    const topOffset = height / 2 + 0.055
    for (const side of [-1, 1] as const) {
      const o = this.rotateOffset(side * sideOffset, 0.055, rotation)
      this.instanceFn('timber', x + o.x, y, z + o.z, 0.055, height + 0.18, 0.07, frameColor, rotation)
    }
    this.instanceFn('timber', x, y + topOffset, z, width + 0.18, 0.055, 0.07, frameColor, rotation)
    this.instanceFn('timber', x, y - topOffset, z, width + 0.18, 0.055, 0.07, frameColor, rotation)

    if (seed % 2 === 0) {
      for (const side of [-1, 1] as const) {
        const shutter = this.rotateOffset(side * (width * 0.82 + 0.12), 0.075, rotation)
        this.instanceFn('timber', x + shutter.x, y, z + shutter.z, width * 0.38, height * 0.88, 0.055, side < 0 ? 0x69503a : 0x614934, rotation)
      }
    }
  }

  private doorAwning(b: Building, rotation: number, doorX: number, frontZ: number, seed: number): void {
    if (seed % 3 === 0) return
    const canopy = this.rotateOffset(doorX, frontZ + 0.26, rotation)
    this.instanceFn('timber', b.x + canopy.x, 1.58, b.z + canopy.z, 1.05, 0.09, 0.56, seed % 2 ? 0x654831 : 0x5b402d, rotation)
    for (const side of [-1, 1] as const) {
      const post = this.rotateOffset(doorX + side * 0.43, frontZ + 0.43, rotation)
      this.instanceFn('timber', b.x + post.x, 0.74, b.z + post.z, 0.075, 1.32, 0.075, 0x493327, rotation)
    }
  }

  warmGroundPool(x: number, z: number, radius: number, strength: number, night: number): void {
    if (night < 0.06 || strength <= 0) return
    const scale = radius * (0.94 + night * 0.06)
    const color = this.scratchColor.copy(this.warmGlow).multiplyScalar(0.66 + Math.min(1, strength) * 0.18).getHex()
    this.instanceFn('warmPool', x, 0.05, z, scale, 1, scale, color)
  }

  campfireGroundPool(x: number, z: number, radius: number, night: number): void {
    if (night < 0.06) return
    const scale = radius * (0.94 + night * 0.06)
    const color = this.scratchColor.copy(this.warmGlow).multiplyScalar(0.82 + night * 0.18).getHex()
    this.instanceFn('campfirePool', x, 0.052, z, scale, 1, scale, color)
  }

  readableNightColor(color: number, night: number): number {
    return this.scratchColor.setHex(color).lerp(this.nightSurfaceLift, night * 0.44).getHex()
  }

  private warmPropColor(color: number, night: number, strength = 0.16): number {
    return this.scratchColor.setHex(color).lerp(this.warmPropLift, night * strength).getHex()
  }

  renderResidentialPlot(plot: ResidentialPlot, b: Building, night: number, plots: ResidentialPlot[]): void {
    this.residentialRenderer.renderResidentialPlot(plot, b, night, plots)
  }

  renderYard(b: Building, rotation: number, radius: number, color = 0x66563f): void {
    const offset = this.rotateOffset(0, 0.45, rotation)
    this.instanceFn('yardPatch', b.x + offset.x, 0.022, b.z + offset.z, radius, 1, radius * 0.86, color, rotation + (b.id % 5) * 0.08)
  }

  private roofDetails(
    b: Building,
    rotation: number,
    width: number,
    depth: number,
    wallHeight: number,
    roofHeight: number,
    roofColor: number,
  ): void {
    const baseY = 0.42 + wallHeight

    // Structural roof detail only: heavy eaves and a ridge beam stay stable while
    // still making gable-front and eave-front silhouettes read differently.
    for (const side of [-1, 1] as const) {
      const eave = this.rotateOffset(side * (width / 2 + 0.24), 0, rotation)
      this.instanceFn('timber', b.x + eave.x, baseY + 0.03, b.z + eave.z, 0.11, 0.11, depth + 0.78, 0x493326, rotation)
    }
    this.instanceFn('timber', b.x, baseY + roofHeight + 0.04, b.z, 0.13, 0.13, depth + 0.82, 0x443025, rotation)
  }

  private frontageClutter(b: Building, rotation: number, seed: number, spread = 1): void {
    const left = this.rotateOffset(-0.9 * spread, 1.35 * spread, rotation)
    const right = this.rotateOffset(0.9 * spread, 1.26 * spread, rotation)
    const near = this.rotateOffset(0.18, 1.55 * spread, rotation)

    if (seed % 2 === 0) {
      this.instanceFn('baskets', b.x + left.x, 0.22, b.z + left.z, 0.56, 0.78, 0.56, 0x9b7648, rotation)
      this.instanceFn('sacks', b.x + right.x, 0.23, b.z + right.z, 0.4, 0.5, 0.36, 0x9a865e, rotation)
    } else {
      this.instanceFn('barrels', b.x + left.x, 0.29, b.z + left.z, 0.38, 0.58, 0.38, 0x745033, rotation)
      this.instanceFn('baskets', b.x + right.x, 0.2, b.z + right.z, 0.5, 0.7, 0.5, 0x9b7648, rotation)
    }

    this.instanceFn('timber', b.x + near.x, 0.31, b.z + near.z, 0.72, 0.09, 0.24, 0x67472f, rotation)
    for (const lx of [-0.28, 0.28]) {
      const leg = this.rotateOffset(0.18 + lx, 1.55 * spread, rotation)
      this.instanceFn('timber', b.x + leg.x, 0.16, b.z + leg.z, 0.08, 0.3, 0.08, 0x513727, rotation)
    }
  }

  private renderCart(b: Building, rotation: number, localX: number, localZ: number, seed: number): void {
    const center = this.rotateOffset(localX, localZ, rotation)
    const cartRotation = rotation + (seed % 2 === 0 ? 0.08 : -0.11)
    this.instanceFn('timber', b.x + center.x, 0.42, b.z + center.z, 1.25, 0.18, 0.72, 0x6a4932, cartRotation)
    this.instanceFn('timber', b.x + center.x, 0.66, b.z + center.z, 1.2, 0.08, 0.08, 0x543a29, cartRotation)
    for (const side of [-1, 1] as const) {
      const wheel = this.rotateOffset(localX + side * 0.62, localZ, rotation)
      this.instanceFn('cartWheel', b.x + wheel.x, 0.34, b.z + wheel.z, 0.66, 0.66, 0.66, 0x493326, cartRotation)
    }
    const shaft = this.rotateOffset(localX, localZ + 1.0, rotation)
    this.instanceFn('timber', b.x + shaft.x, 0.35, b.z + shaft.z, 0.08, 0.08, 1.8, 0x5b3f2d, cartRotation)
  }

  private renderLaundryLine(b: Building, rotation: number, localX: number, localZ: number, seed: number): void {
    const left = this.rotateOffset(localX - 0.9, localZ, rotation)
    const right = this.rotateOffset(localX + 0.9, localZ, rotation)
    this.instanceFn('timber', b.x + left.x, 0.72, b.z + left.z, 0.08, 1.45, 0.08, 0x4d3829, rotation)
    this.instanceFn('timber', b.x + right.x, 0.72, b.z + right.z, 0.08, 1.45, 0.08, 0x4d3829, rotation)
    const line = this.rotateOffset(localX, localZ, rotation)
    this.instanceFn('timber', b.x + line.x, 1.22, b.z + line.z, 1.82, 0.035, 0.035, 0x4e4135, rotation)
    for (let i = 0; i < 3; i++) {
      const cloth = this.rotateOffset(localX - 0.58 + i * 0.58, localZ + 0.02, rotation)
      const colors = [0x8d6d5e, 0xb18b69, 0x6f6d62]
      this.instanceFn('cloth', b.x + cloth.x, 1.0 - (i % 2) * 0.05, b.z + cloth.z, 0.4, 0.46, 0.035, colors[(seed + i) % colors.length], rotation)
    }
  }

  private timberFrame(
    b: Building,
    rotation: number,
    width: number,
    depth: number,
    wallHeight: number,
    plasterColor: number,
    roofColor: number,
    roofHeight = 1.18,
    roofFront: 'gable' | 'eave' = 'gable',
  ): void {
    this.instanceFn('stone', b.x, 0.18, b.z, width + 0.24, 0.36, depth + 0.24, TOWN_PALETTE.stoneDark, rotation)
    this.instanceFn('plaster', b.x, 0.42 + wallHeight / 2, b.z, width, wallHeight, depth, plasterColor, rotation)

    const halfX = width / 2 + 0.045
    const halfZ = depth / 2 + 0.045
    for (const [lx, lz] of [[-halfX, -halfZ], [halfX, -halfZ], [-halfX, halfZ], [halfX, halfZ]] as const) {
      const o = this.rotateOffset(lx, lz, rotation)
      this.instanceFn('timber', b.x + o.x, 0.42 + wallHeight / 2, b.z + o.z, 0.13, wallHeight + 0.12, 0.13, TOWN_PALETTE.timberDark, rotation)
    }

    for (const y of [0.48, 0.42 + wallHeight * 0.54, 0.42 + wallHeight]) {
      const front = this.rotateOffset(0, halfZ, rotation)
      const back = this.rotateOffset(0, -halfZ, rotation)
      this.instanceFn('timber', b.x + front.x, y, b.z + front.z, width + 0.16, 0.1, 0.11, TOWN_PALETTE.timberMid, rotation)
      this.instanceFn('timber', b.x + back.x, y, b.z + back.z, width + 0.16, 0.1, 0.11, TOWN_PALETTE.timberMid, rotation)
      const left = this.rotateOffset(-halfX, 0, rotation)
      const right = this.rotateOffset(halfX, 0, rotation)
      this.instanceFn('timber', b.x + left.x, y, b.z + left.z, 0.11, 0.1, depth + 0.16, TOWN_PALETTE.timberMid, rotation)
      this.instanceFn('timber', b.x + right.x, y, b.z + right.z, 0.11, 0.1, depth + 0.16, TOWN_PALETTE.timberMid, rotation)
    }

    // Front/back diagonal braces break up the flat plaster panels.
    for (const lz of [-halfZ - 0.018, halfZ + 0.018]) {
      for (const side of [-1, 1] as const) {
        const brace = this.rotateOffset(side * width * 0.22, lz, rotation)
        this.instanceFn(
          side < 0 ? 'braceL' : 'braceR',
          b.x + brace.x,
          0.42 + wallHeight * 0.54,
          b.z + brace.z,
          Math.max(0.48, width * 0.22),
          0.09,
          0.1,
          0x4a3427,
          rotation,
        )
      }
    }

    const roofRotation = roofFront === 'eave' ? rotation + Math.PI / 2 : rotation
    const roofWidth = roofFront === 'eave' ? depth : width
    const roofDepth = roofFront === 'eave' ? width : depth
    this.instanceFn('gableRoofs', b.x, 0.42 + wallHeight, b.z, roofWidth + 0.72, roofHeight * 2, roofDepth + 0.82, roofColor, roofRotation)
    this.roofDetails(b, roofRotation, roofWidth, roofDepth, wallHeight, roofHeight, roofColor)
  }

  private fenceLine(b: Building, rotation: number, localX: number, localZ: number, length: number, alongX: boolean): void {
    const center = this.rotateOffset(localX, localZ, rotation)
    const segmentRotation = alongX ? rotation : rotation + Math.PI / 2
    this.instanceFn('timber', b.x + center.x, 0.48, b.z + center.z, length, 0.09, 0.1, 0x604630, segmentRotation)
    this.instanceFn('timber', b.x + center.x, 0.82, b.z + center.z, length, 0.08, 0.09, 0x604630, segmentRotation)
    for (const offset of [-length / 2, 0, length / 2]) {
      const post = this.rotateOffset(localX + (alongX ? offset : 0), localZ + (alongX ? 0 : offset), rotation)
      this.instanceFn('timber', b.x + post.x, 0.48, b.z + post.z, 0.11, 0.96, 0.11, 0x4e3828, rotation)
    }
  }

  renderAdultFigure(
    x: number,
    z: number,
    id: number,
    guard: boolean,
    time: number,
    colorOverride?: number,
    facing = 0,
  ): void {
    const femaleSilhouette = id % 2 === 0
    const skin = id % 3 === 0 ? 0xc89572 : id % 3 === 1 ? 0xdfb08d : 0xb87f61
    const hair = [0x3d2b22, 0x69452d, 0x2c2725, 0x8b6a3d][id % 4]
    const cloth = colorOverride ?? [0x705345, 0x6d6251, 0x7b4e50, 0x596452, 0x725f3f][id % 5]
    const bob = Math.sin(time * 2.1 + id) * 0.012
    const armSwing = Math.sin(time * 2.3 + id * 0.7) * 0.035

    const leftArm = this.rotateOffset(-0.25, armSwing, facing)
    const rightArm = this.rotateOffset(0.25, -armSwing, facing)
    const leftLeg = this.rotateOffset(-0.11, 0, facing)
    const rightLeg = this.rotateOffset(0.11, 0, facing)

    if (guard) {
      this.instanceFn('guardCoat', x, 0.72 + bob, z, 1, 1, 1, 0x65504a, facing)
      this.instanceFn('adultLeg', x + leftLeg.x, 0.27 + bob, z + leftLeg.z, 1, 0.92, 1, 0x383b3b, facing)
      this.instanceFn('adultLeg', x + rightLeg.x, 0.27 + bob, z + rightLeg.z, 1, 0.92, 1, 0x383b3b, facing)
      this.instanceFn('adultArm', x + leftArm.x, 0.82 + bob, z + leftArm.z, 0.92, 0.95, 0.92, 0x65504a, facing)
      this.instanceFn('adultArm', x + rightArm.x, 0.82 + bob, z + rightArm.z, 0.92, 0.95, 0.92, 0x65504a, facing)
      this.instanceFn('metal', x, 1.18 + bob, z, 0.42, 0.17, 0.42, 0x667078, facing)
    } else if (femaleSilhouette) {
      this.instanceFn('adultSkirt', x, 0.43 + bob, z, 0.95, 1.02, 0.95, cloth, facing)
      this.instanceFn('adultBodice', x, 0.91 + bob, z, 0.96, 0.98, 0.9, cloth, facing)
      this.instanceFn('adultArm', x + leftArm.x, 0.89 + bob, z + leftArm.z, 0.92, 0.95, 0.92, skin, facing)
      this.instanceFn('adultArm', x + rightArm.x, 0.89 + bob, z + rightArm.z, 0.92, 0.95, 0.92, skin, facing)
      const sash = this.rotateOffset(0.02, 0.08, facing)
      this.instanceFn('cloth', x + sash.x, 0.76 + bob, z + sash.z, 0.42, 0.08, 0.3, this.scratchColor.setHex(cloth).multiplyScalar(1.15).getHex(), facing)
    } else {
      this.instanceFn('adultTorso', x, 0.72 + bob, z, 1.02, 1.06, 0.95, cloth, facing)
      this.instanceFn('adultLeg', x + leftLeg.x, 0.26 + bob, z + leftLeg.z, 1, 0.95, 1, 0x3d342e, facing)
      this.instanceFn('adultLeg', x + rightLeg.x, 0.26 + bob, z + rightLeg.z, 1, 0.95, 1, 0x3d342e, facing)
      this.instanceFn('adultArm', x + leftArm.x, 0.82 + bob, z + leftArm.z, 0.92, 0.96, 0.92, cloth, facing)
      this.instanceFn('adultArm', x + rightArm.x, 0.82 + bob, z + rightArm.z, 0.92, 0.96, 0.92, cloth, facing)
    }

    this.instanceFn('adultHead', x, 1.31 + bob, z, 1, 1.06, 1, skin, facing)
    this.instanceFn('adultHair', x, 1.42 + bob, z - 0.025, 1.04, 0.68, 1.04, hair, facing)
    if (femaleSilhouette || id % 4 === 1) {
      const back = this.rotateOffset(0, -0.12, facing)
      this.instanceFn('adultHairLong', x + back.x, 1.12 + bob, z + back.z, 0.92, femaleSilhouette ? 1.08 : 0.78, 0.78, hair, facing)
    }
  }

  private renderTavernNightlife(b: Building, rotation: number, time: number, activity: number): void {
    if (activity < 0.18 || b.inventory.ale <= 0) return
    const spots = [
      [-0.82, 2.08, TOWN_PALETTE.clothWine],
      [0.12, 2.24, 0x6b4b65],
      [0.94, 1.84, TOWN_PALETTE.clothOchre],
      [-1.28, 1.52, 0x5a624c],
      [1.38, 2.04, 0x665040],
    ] as const

    for (let i = 0; i < spots.length; i++) {
      const [lx, lz, color] = spots[i]
      const p = this.rotateOffset(lx, lz, rotation)
      const sway = Math.sin(time * (1.5 + i * 0.12) + b.id + i) * 0.05 * activity
      const facing = rotation + Math.PI + sway

      if (i < 2) {
        const skin = i === 0 ? 0xd4a17d : 0xb97f62
        const hair = i === 0 ? 0x4b2e25 : 0x6a472f
        const left = this.rotateOffset(-0.27, 0.02, facing)
        const right = this.rotateOffset(0.27, -0.02, facing)
        const back = this.rotateOffset(0, -0.13, facing)

        // Adult Tavern entertainers intentionally have a more polished/fitted
        // silhouette than workers: fitted bodice, flowing skirt, bare arms, long
        // hair and a metallic belt/jewelry accent. This remains stylized/non-explicit.
        this.instanceFn('entertainer', b.x + p.x, 0.47, b.z + p.z, 1.05, 1.04, 1.05, color, facing)
        this.instanceFn('adultBodice', b.x + p.x, 0.93, b.z + p.z, 1.08, 1.0, 0.92, this.scratchColor.setHex(color).multiplyScalar(1.08).getHex(), facing)
        this.instanceFn('adultArm', b.x + p.x + left.x, 0.9, b.z + p.z + left.z, 1, 1, 1, skin, facing)
        this.instanceFn('adultArm', b.x + p.x + right.x, 0.9, b.z + p.z + right.z, 1, 1, 1, skin, facing)
        this.instanceFn('metal', b.x + p.x, 0.72, b.z + p.z, 0.44, 0.055, 0.34, 0xb49761, facing)
        this.instanceFn('adultHead', b.x + p.x, 1.32, b.z + p.z, 1, 1.06, 1, skin, facing)
        this.instanceFn('adultHair', b.x + p.x, 1.43, b.z + p.z - 0.02, 1.08, 0.7, 1.06, hair, facing)
        this.instanceFn('adultHairLong', b.x + p.x + back.x, 1.13, b.z + p.z + back.z, 1, 1.18, 0.82, hair, facing)
      } else {
        this.renderAdultFigure(b.x + p.x, b.z + p.z, b.id * 10 + i, false, time, color, facing)
      }
    }
  }

  renderStockpile(b: Building, rotation: number, color: number, night: number): void {
    this.renderYard(b, rotation, 2.45, 0x61543f)
    this.instanceFn('stone', b.x, 0.1, b.z, 2.85, 0.2, 2.75, this.readableNightColor(0x6e695d, night), rotation)
    const roofColor = this.readableNightColor(TOWN_PALETTE.thatch, night)
    this.instanceFn('gableRoofs', b.x, 1.58, b.z - 0.12, 2.95, 1.05, 2.5, roofColor, rotation)

    for (const [lx, lz] of [[-1.18, -0.9], [1.18, -0.9], [-1.18, 0.9], [1.18, 0.9]] as const) {
      const o = this.rotateOffset(lx, lz, rotation)
      this.instanceFn('timber', b.x + o.x, 0.78, b.z + o.z, 0.15, 1.55, 0.15, TOWN_PALETTE.timberDark, rotation)
    }
    const rear = this.rotateOffset(0, -1.12, rotation)
    this.instanceFn('timber', b.x + rear.x, 0.88, b.z + rear.z, 2.5, 0.12, 0.12, TOWN_PALETTE.timberMid, rotation)

    const woodStacks = Math.min(5, Math.ceil(b.inventory.wood / 40))
    for (let i = 0; i < woodStacks; i++) {
      const o = this.rotateOffset(-0.75 + (i % 3) * 0.54, -0.45 + Math.floor(i / 3) * 0.52, rotation)
      this.instanceFn('logs', b.x + o.x, 0.28 + (i % 2) * 0.09, b.z + o.z, 0.75, 0.75, 0.75, 0x704d33, rotation)
    }
    const foodSacks = Math.min(4, Math.ceil(b.inventory.food / 30))
    for (let i = 0; i < foodSacks; i++) {
      const o = this.rotateOffset(0.62 + (i % 2) * 0.38, -0.45 + Math.floor(i / 2) * 0.48, rotation)
      this.instanceFn('sacks', b.x + o.x, 0.28, b.z + o.z, 0.48, 0.62, 0.42, 0x9a865e, rotation)
    }
    const barrels = Math.min(3, Math.ceil(b.inventory.ale / 8))
    for (let i = 0; i < barrels; i++) {
      const o = this.rotateOffset(-0.86 + i * 0.5, 0.66, rotation)
      this.instanceFn('barrels', b.x + o.x, 0.36, b.z + o.z, 0.46, 0.72, 0.46, this.warmPropColor(0x765033, night, 0.12), rotation)
    }
    const oreCount = Math.min(4, Math.ceil(b.inventory.ore / 8))
    for (let i = 0; i < oreCount; i++) {
      const o = this.rotateOffset(0.62 + (i % 2) * 0.42, 0.66 + Math.floor(i / 2) * 0.36, rotation)
      this.instanceFn('ore', b.x + o.x, 0.22, b.z + o.z, 0.42, 0.36, 0.42, 0x68717a, rotation + i * 0.3)
    }
    if (b.inventory.tools > 0) {
      const rack = this.rotateOffset(1.12, 0.08, rotation)
      this.instanceFn('timber', b.x + rack.x, 0.52, b.z + rack.z, 0.12, 0.95, 0.12, 0x563d2b, rotation)
      for (let i = 0; i < Math.min(4, b.inventory.tools); i++) {
        const p = this.rotateOffset(0.94, -0.22 + i * 0.16, rotation)
        this.instanceFn('metal', b.x + p.x, 0.55 + i * 0.05, b.z + p.z, 0.42, 0.08, 0.08, 0x6f777c, rotation + 0.2)
      }
    }

    this.renderCart(b, rotation, -1.85, 0.55, b.id)
    const basket = this.rotateOffset(1.2, -0.9, rotation)
    this.instanceFn('baskets', b.x + basket.x, 0.21, b.z + basket.z, 0.62, 0.78, 0.62, 0x987044, rotation)
  }

  renderHouse(b: Building, rotation: number, color: number, night: number, plot?: ResidentialPlot): void {
    const profile = plot ? residentialPresentationProfile(plot) : null
    const width = profile?.houseWidth ?? 2.48
    const depth = profile?.houseDepth ?? 2.22
    const wallHeight = profile?.wallHeight ?? 1.86
    const residentialPlacement = plot && profile ? this.residentialRenderer.residentialVisualPlacement(b, plot, profile) : null
    const visualB: Building = residentialPlacement?.visualB ?? b

    const plaster = plot
      ? profile?.tier === 'burgage'
        ? [0xc0ad8d, 0xb7a584, 0xc6b393][plot.id % 3]
        : [0xb4a486, 0xa89b80, 0xc0ad8d, 0x9e9782][plot.id % 4]
      : b.id % 3 === 0 ? 0xa99d83 : color
    const roof = plot
      ? profile?.tier === 'burgage'
        ? [TOWN_PALETTE.roofBrown, 0x6c5542, TOWN_PALETTE.roofDark][plot.id % 3]
        : [TOWN_PALETTE.thatch, TOWN_PALETTE.roofBrown, 0x66533d][plot.id % 3]
      : b.id % 2 ? TOWN_PALETTE.roofBrown : TOWN_PALETTE.thatch

    if (!plot) this.renderYard(visualB, rotation, 2.65, b.id % 2 ? 0x655740 : 0x6b5a40)
    this.timberFrame(
      visualB,
      rotation,
      width,
      depth,
      wallHeight,
      plaster,
      this.readableNightColor(roof, night),
      profile?.roofHeight ?? 1.02 + (plot?.id ?? b.id) % 3 * 0.08,
      profile?.roofFront ?? 'gable',
    )

    const seed = plot?.id ?? b.id
    const doorX = profile
      ? residentialPlacement?.doorX ?? this.residentialRenderer.residentialDoorOffset(profile, seed, width)
      : ((seed % 3) - 1) * Math.min(0.48, width * 0.16)

    const front = this.rotateOffset(doorX, depth / 2 + 0.08, rotation)
    this.instanceFn('doors', visualB.x + front.x, 0.82, visualB.z + front.z, 0.54, 1.35, 0.13, 0x4b3325, rotation)

    const facadeWindowCount = profile?.facadeWindows ?? 2
    const windowSpread = Math.min(
      width * 0.32,
      profile?.form === 'wide-deep' ? 1.42 : profile?.form === 'wide-shallow' ? 1.35 : profile?.tier === 'homestead' ? 1.08 : 0.9,
    )
    const windowPositions = facadeWindowCount === 1
      ? [doorX >= 0 ? -Math.min(windowSpread, width * 0.22) : Math.min(windowSpread, width * 0.22)]
      : facadeWindowCount === 3
        ? [-windowSpread, 0, windowSpread]
        : [-windowSpread, windowSpread]

    let windowIndex = 0
    for (const lx of windowPositions) {
      if (Math.abs(lx - doorX) < 0.38) continue
      const win = this.rotateOffset(lx, depth / 2 + 0.105, rotation)
      this.framedWindow(visualB.x + win.x, 1.3, visualB.z + win.z, rotation, night, 0.34, 0.44, seed + windowIndex)
      windowIndex += 1
    }

    if (plot && profile?.roofFront === 'gable' && (profile.form === 'long-burgage' || seed % 4 === 0)) {
      const loft = this.rotateOffset(0, depth / 2 + 0.43, rotation)
      this.framedWindow(
        visualB.x + loft.x,
        wallHeight + 0.38,
        visualB.z + loft.z,
        rotation,
        night * 0.72,
        0.25,
        0.28,
        seed + 17,
      )
    }

    if (plot && (width > 3 || profile?.form === 'long-burgage')) {
      const side = profile?.sidePassage || (plot.id % 2 === 0 ? 1 : -1)
      const sideWin = this.rotateOffset(side * (width / 2 + 0.105), profile?.form === 'long-burgage' ? -0.35 : -0.15, rotation)
      this.framedWindow(
        visualB.x + sideWin.x,
        1.26,
        visualB.z + sideWin.z,
        rotation + Math.PI / 2,
        night * 0.82,
        0.3,
        0.4,
        plot.id + 9,
      )
    }

    const chimneySide = seed % 2 ? 1 : -1
    const chimney = this.rotateOffset(chimneySide * width * 0.3, -depth * 0.18, rotation)
    this.instanceFn('stone', visualB.x + chimney.x, wallHeight + 0.72, visualB.z + chimney.z, 0.32, 1.45, 0.32, 0x66645f, rotation)

    if (plot && profile && residentialPlacement && (profile.form === 'wide-shallow' || profile.form === 'wide-deep')) {
      const baySide = plot.id % 2 === 0 ? -1 : 1
      const bayWidth = profile.form === 'wide-deep' ? 1.75 : 1.5
      const bayDepth = profile.form === 'wide-deep' ? 1.45 : 1.2
      const desiredProjection = profile.form === 'wide-deep' ? 0.38 : 0.28
      const safeProjection = Math.max(0.08, residentialPlacement.frontClearance - 0.28)
      const projection = Math.min(desiredProjection, safeProjection)
      const bayX = baySide * Math.min(width * 0.28, 0.92)
      const bayZ = depth / 2 - bayDepth / 2 + projection
      const bay = this.rotateOffset(bayX, bayZ, rotation)
      this.instanceFn('stone', visualB.x + bay.x, 0.13, visualB.z + bay.z, bayWidth + 0.12, 0.26, bayDepth + 0.12, 0x69645b, rotation)
      this.instanceFn('plaster', visualB.x + bay.x, 0.72, visualB.z + bay.z, bayWidth, 1.24, bayDepth, plaster, rotation)
      this.instanceFn(
        'gableRoofs',
        visualB.x + bay.x,
        1.31,
        visualB.z + bay.z,
        bayWidth + 0.42,
        0.78,
        bayDepth + 0.4,
        this.readableNightColor(roof, night),
        rotation,
      )
      const bayWindow = this.rotateOffset(bayX, bayZ + bayDepth / 2 + 0.08, rotation)
      this.framedWindow(
        visualB.x + bayWindow.x,
        0.92,
        visualB.z + bayWindow.z,
        rotation,
        night * 0.82,
        0.28,
        0.36,
        plot.id + 41,
      )

      if (profile.form === 'wide-deep') {
        const secondChimney = this.rotateOffset(-chimneySide * width * 0.24, -depth * 0.26, rotation)
        this.instanceFn('stone', visualB.x + secondChimney.x, wallHeight + 0.54, visualB.z + secondChimney.z, 0.28, 1.1, 0.28, 0x625f5a, rotation)
      }
    }

    if (plot && profile && (profile.form === 'wide-deep' || (profile.tier === 'homestead' && profile.form === 'balanced' && plot.id % 3 === 0))) {
      const dormer = this.rotateOffset(-width * 0.18, depth * 0.15, rotation)
      this.instanceFn('plaster', visualB.x + dormer.x, wallHeight + 0.78, visualB.z + dormer.z, 0.66, 0.44, 0.56, plaster, rotation)
      this.instanceFn('gableRoofs', visualB.x + dormer.x, wallHeight + 0.98, visualB.z + dormer.z, 0.88, 0.48, 0.82, this.readableNightColor(roof, night), rotation)
      const dormerWindow = this.rotateOffset(-width * 0.18, depth * 0.45, rotation)
      this.warmWindow(visualB.x + dormerWindow.x, wallHeight + 0.72, visualB.z + dormerWindow.z, rotation, night, 0.24, 0.28)
    }

    const step = this.rotateOffset(doorX, depth / 2 + 0.22, rotation)
    this.instanceFn('stone', visualB.x + step.x, 0.12, visualB.z + step.z, 0.76, 0.22, 0.48, 0x777064, rotation)
    this.doorAwning(visualB, rotation, doorX, depth / 2, seed)
    this.frontageClutter(visualB, rotation, seed, Math.min(1.05, width / 2.7))

    if (plot && profile && plot.depth >= 7.6 && (profile.tier !== 'cottage' || profile.form === 'long-burgage')) {
      const rearWidth = profile.form === 'long-burgage' ? 0.94 : profile.tier === 'burgage' ? 1.45 : 1.15
      const rearDepth = profile.form === 'long-burgage' ? 1.32 : profile.tier === 'burgage' ? 1.42 : 1.08
      const extensionSide = profile.sidePassage !== 0 ? -profile.sidePassage : (plot.id % 2 === 0 ? 1 : -1)
      const rearExtension = this.rotateOffset(
        extensionSide * Math.min(width * 0.28, profile.form === 'long-burgage' ? 0.55 : 0.9),
        -depth / 2 - rearDepth * 0.42,
        rotation,
      )
      this.instanceFn(
        profile.tier === 'burgage' ? 'plaster' : 'timber',
        visualB.x + rearExtension.x,
        0.5,
        visualB.z + rearExtension.z,
        rearWidth,
        profile.tier === 'burgage' ? 1.05 : 0.9,
        rearDepth,
        profile.tier === 'burgage' ? plaster : 0x6b4d37,
        rotation,
      )
      this.instanceFn(
        'gableRoofs',
        visualB.x + rearExtension.x,
        profile.tier === 'burgage' ? 1.02 : 0.91,
        visualB.z + rearExtension.z,
        rearWidth + 0.3,
        profile.tier === 'burgage' ? 0.66 : 0.56,
        rearDepth + 0.28,
        this.readableNightColor(profile.tier === 'burgage' ? roof : 0x67513c, night),
        rotation,
      )
    }

    if (plot && profile?.form === 'wide-deep' && residentialPlacement) {
      const wingSide = -profile.sidePassage
      const wingRotation = rotation + Math.PI / 2
      const wingWidth = profile.courtyard === 'u' ? 2.8 : 2.55
      const wingDepth = 1.82
      const plotHalfW = residentialPlotWidth(plot) / 2
      const desiredWingX = residentialPlacement.localX + wingSide * (width / 2 + wingDepth * 0.3)
      const maxWingCenter = Math.max(0.2, plotHalfW - wingDepth / 2 - 0.28)
      const clampedWingPlotX = THREE.MathUtils.clamp(desiredWingX, -maxWingCenter, maxWingCenter)
      const wingLocalX = clampedWingPlotX - residentialPlacement.localX
      const wing = this.rotateOffset(wingLocalX, -depth * 0.02, rotation)
      this.instanceFn('stone', visualB.x + wing.x, 0.14, visualB.z + wing.z, wingWidth + 0.14, 0.28, wingDepth + 0.14, 0x67635b, wingRotation)
      this.instanceFn('plaster', visualB.x + wing.x, 0.9, visualB.z + wing.z, wingWidth, 1.52, wingDepth, plaster, wingRotation)
      this.instanceFn(
        'gableRoofs',
        visualB.x + wing.x,
        1.63,
        visualB.z + wing.z,
        wingWidth + 0.44,
        0.94,
        wingDepth + 0.46,
        this.readableNightColor(roof, night),
        wingRotation,
      )
      const wingWindow = this.rotateOffset(
        wingLocalX + wingSide * wingDepth * 0.34,
        -depth * 0.02,
        rotation,
      )
      this.framedWindow(
        visualB.x + wingWindow.x,
        1.08,
        visualB.z + wingWindow.z,
        rotation + (wingSide > 0 ? Math.PI / 2 : -Math.PI / 2),
        night * 0.82,
        0.3,
        0.4,
        plot.id + 31,
      )

      if (profile.courtyard === 'u') {
        const returnSide = -wingSide
        const returnWidth = 2.15
        const returnDepth = 1.5
        const desiredReturnX = residentialPlacement.localX + returnSide * (width / 2 + returnDepth * 0.26)
        const maxReturnCenter = Math.max(0.2, plotHalfW - returnDepth / 2 - 0.28)
        const clampedReturnPlotX = THREE.MathUtils.clamp(desiredReturnX, -maxReturnCenter, maxReturnCenter)
        const returnLocalX = clampedReturnPlotX - residentialPlacement.localX
        const returnWing = this.rotateOffset(
          returnLocalX,
          -depth * 0.34,
          rotation,
        )
        this.instanceFn('timber', visualB.x + returnWing.x, 0.62, visualB.z + returnWing.z, returnWidth, 1.18, returnDepth, 0x684b36, wingRotation)
        this.instanceFn(
          'gableRoofs',
          visualB.x + returnWing.x,
          1.16,
          visualB.z + returnWing.z,
          returnWidth + 0.38,
          0.72,
          returnDepth + 0.38,
          this.readableNightColor(0x67513e, night),
          wingRotation,
        )
      }
    }

    if (plot && plot.depth >= 7.4 && (plot.id % 4 === 0 || profile?.form === 'wide-deep')) {
      const laundryX = profile?.sidePassage ? -profile.sidePassage * Math.min(0.7, width * 0.18) : 0
      this.renderLaundryLine(visualB, rotation, laundryX, -depth / 2 - 1.65, plot.id)
    }

    if (plot && profile?.form !== 'wide-deep' && plot.id % 3 === 1) {
      const leanSide = profile?.sidePassage ? -profile.sidePassage : -1
      const lean = this.rotateOffset(leanSide * (width / 2 + 0.42), -0.2, rotation)
      this.instanceFn('timber', visualB.x + lean.x, 0.5, visualB.z + lean.z, 0.72, 0.92, 1.1, 0x6b4d37, rotation)
      this.instanceFn('cloth', visualB.x + lean.x, 0.98, visualB.z + lean.z, 0.94, 0.08, 1.3, 0x776044, rotation)
    } else if (plot && (profile?.form === 'wide-deep' || plot.id % 3 === 2)) {
      const porch = this.rotateOffset(doorX * 0.35, depth / 2 + 0.48, rotation)
      this.instanceFn('timber', visualB.x + porch.x, 0.18, visualB.z + porch.z, Math.min(width * 0.65, 2.0), 0.18, 0.72, 0x674a34, rotation)
      const porchHalf = Math.min(0.66, width * 0.2)
      for (const lx of [-porchHalf, porchHalf]) {
        const post = this.rotateOffset(doorX * 0.35 + lx, depth / 2 + 0.72, rotation)
        this.instanceFn('timber', visualB.x + post.x, 0.66, visualB.z + post.z, 0.09, 1.15, 0.09, 0x4c3628, rotation)
      }
    }

    if (!plot) {
      this.fenceLine(visualB, rotation, -1.55, -0.25, 2.8, false)
      this.fenceLine(visualB, rotation, 0, -1.65, 3.0, true)
      for (let i = 0; i < 4; i++) {
        const log = this.rotateOffset(-0.9 + i * 0.35, -1.2, rotation)
        this.instanceFn('logs', visualB.x + log.x, 0.2 + (i % 2) * 0.08, visualB.z + log.z, 0.52, 0.52, 0.52, 0x6d4a31, rotation)
      }
    }
  }

  renderGuardPost(b: Building, rotation: number, color: number, night: number): void {
    this.renderYard(b, rotation, 2.45, 0x5d503d)
    this.instanceFn('stone', b.x, 0.18, b.z, 2.2, 0.36, 2.2, 0x66655f, rotation)
    for (const [lx, lz] of [[-0.82, -0.82], [0.82, -0.82], [-0.82, 0.82], [0.82, 0.82]] as const) {
      const o = this.rotateOffset(lx, lz, rotation)
      this.instanceFn('timber', b.x + o.x, 1.1, b.z + o.z, 0.18, 2.05, 0.18, 0x503827, rotation)
    }
    this.instanceFn('timber', b.x, 1.54, b.z, 2.45, 0.18, 2.45, 0x68482f, rotation)
    this.instanceFn('gableRoofs', b.x, 1.72, b.z, 2.48, 1.06, 2.15, this.readableNightColor(0x49403a, night), rotation)
    for (const z of [-0.94, 0.94]) {
      const rail = this.rotateOffset(0, z, rotation)
      this.instanceFn('timber', b.x + rail.x, 1.82, b.z + rail.z, 2.08, 0.09, 0.09, 0x513725, rotation)
    }
    const ladder = this.rotateOffset(-0.92, 0.12, rotation)
    this.instanceFn('timber', b.x + ladder.x, 0.72, b.z + ladder.z, 0.08, 1.42, 0.08, 0x4e3828, rotation)
    for (let i = 0; i < 4; i++) {
      const rung = this.rotateOffset(-0.92, -0.08 + i * 0.22, rotation)
      this.instanceFn('timber', b.x + rung.x, 0.28 + i * 0.26, b.z + rung.z, 0.58, 0.07, 0.08, 0x5a402d, rotation)
    }
    const rack = this.rotateOffset(1.12, 0.32, rotation)
    this.instanceFn('timber', b.x + rack.x, 0.62, b.z + rack.z, 0.12, 1.05, 0.12, 0x503827, rotation)
    for (let i = 0; i < 3; i++) {
      this.instanceFn('metal', b.x + rack.x, 0.72 + i * 0.14, b.z + rack.z, 0.66 - i * 0.08, 0.07, 0.08, i === 0 ? 0x777f84 : 0x626b70, rotation + 0.18)
    }
    const bench = this.rotateOffset(0.2, 1.25, rotation)
    this.instanceFn('timber', b.x + bench.x, 0.34, b.z + bench.z, 1.0, 0.12, 0.34, 0x65472f, rotation)
    this.frontageClutter(b, rotation, b.id + 17, 0.86)
  }

  renderTavern(b: Building, rotation: number, color: number, night: number, time: number, activity: number): void {
    this.renderYard(b, rotation, 3.15, 0x6a563d)
    this.timberFrame(b, rotation, 2.92, 2.72, 2.02, color, this.readableNightColor(0x544039, night), 1.28)

    const front = this.rotateOffset(0.48, 1.43, rotation)
    this.instanceFn('doors', b.x + front.x, 0.86, b.z + front.z, 0.66, 1.48, 0.14, 0x493126, rotation)
    for (const [index, lx] of [-0.78, 0, 0.82].entries()) {
      const win = this.rotateOffset(lx, 1.47, rotation)
      this.framedWindow(b.x + win.x, 1.35, b.z + win.z, rotation, night, 0.38, 0.5, b.id + index)
    }

    const signPost = this.rotateOffset(1.55, 1.22, rotation)
    this.instanceFn('timber', b.x + signPost.x, 1.42, b.z + signPost.z, 0.12, 1.7, 0.12, 0x503526, rotation)
    const sign = this.rotateOffset(1.55, 1.1, rotation)
    this.instanceFn('timber', b.x + sign.x, 1.84, b.z + sign.z, 0.82, 0.62, 0.1, 0x5d3e2c, rotation)
    const signFace = this.rotateOffset(1.55, 1.16, rotation)
    this.instanceFn('cloth', b.x + signFace.x, 1.84, b.z + signFace.z, 0.64, 0.44, 0.045, TOWN_PALETTE.clothWine, rotation)
    if (night > 0.12) {
      this.instanceFn('glow', b.x + signFace.x, 1.7, b.z + signFace.z, 0.32, 0.26, 0.32, 0xffb766)
    }

    const awning = this.rotateOffset(-0.55, 1.72, rotation)
    this.instanceFn('cloth', b.x + awning.x, 1.72, b.z + awning.z, 1.65, 0.1, 0.92, 0x865e4d, rotation)

    for (const [lx, lz] of [[-1.2, 1.55], [-0.72, 1.72], [1.0, 1.38]] as const) {
      const barrel = this.rotateOffset(lx, lz, rotation)
      this.instanceFn('barrels', b.x + barrel.x, 0.37, b.z + barrel.z, 0.45, 0.74, 0.45, this.warmPropColor(0x765031, night, 0.2), rotation)
    }
    for (const lx of [-0.9, 0.4]) {
      const table = this.rotateOffset(lx, 2.0, rotation)
      this.instanceFn('timber', b.x + table.x, 0.48, b.z + table.z, 0.85, 0.12, 0.52, 0x69472f, rotation)
      this.instanceFn('timber', b.x + table.x, 0.25, b.z + table.z, 0.12, 0.5, 0.12, 0x543826, rotation)
    }

    const sideCanopy = this.rotateOffset(-1.72, 0.15, rotation)
    this.instanceFn('timber', b.x + sideCanopy.x, 0.78, b.z + sideCanopy.z, 0.12, 1.5, 0.12, 0x513727, rotation)
    const sideAwning = this.rotateOffset(-1.56, 0.34, rotation)
    this.instanceFn('cloth', b.x + sideAwning.x, 1.28, b.z + sideAwning.z, 1.32, 0.08, 1.4, 0x71434a, rotation)
    this.frontageClutter(b, rotation, b.id + 7, 1.12)
    this.renderCart(b, rotation, 1.85, -0.35, b.id + 3)

    this.renderTavernNightlife(b, rotation, time, activity)
  }

  renderBrewery(
    b: Building,
    rotation: number,
    color: number,
    time: number,
    night: number,
    productionPhaseActive: boolean,
  ): void {
    this.renderYard(b, rotation, 2.85, 0x645440)
    this.timberFrame(b, rotation, 2.72, 2.58, 1.82, color, this.readableNightColor(0x5a493c, night), 1.08)

    const chimney = this.rotateOffset(0.86, -0.7, rotation)
    this.instanceFn('stone', b.x + chimney.x, 2.45, b.z + chimney.z, 0.4, 1.75, 0.4, 0x5d5b57, rotation)
    for (const [lx, lz, scale] of [[-1.02, 1.3, 0.5], [-0.48, 1.35, 0.44], [0.2, 1.32, 0.42]] as const) {
      const barrel = this.rotateOffset(lx, lz, rotation)
      this.instanceFn('barrels', b.x + barrel.x, 0.38, b.z + barrel.z, scale, 0.78, scale, this.warmPropColor(0x745033, night, 0.15), rotation)
    }
    const rack = this.rotateOffset(-1.3, -0.4, rotation)
    this.instanceFn('timber', b.x + rack.x, 0.62, b.z + rack.z, 0.12, 1.1, 0.12, 0x5a3f2c, rotation)
    for (let i = 0; i < 3; i++) {
      const p = this.rotateOffset(-1.18, -0.7 + i * 0.34, rotation)
      this.instanceFn('barrels', b.x + p.x, 0.28, b.z + p.z, 0.32, 0.54, 0.32, 0x66472f, rotation)
    }
    const malt = this.rotateOffset(1.18, -0.35, rotation)
    this.instanceFn('sacks', b.x + malt.x, 0.25, b.z + malt.z, 0.52, 0.62, 0.48, 0x9d895f, rotation)
    const basket = this.rotateOffset(1.22, 0.1, rotation)
    this.instanceFn('baskets', b.x + basket.x, 0.21, b.z + basket.z, 0.56, 0.72, 0.56, 0x987044, rotation)
    this.frontageClutter(b, rotation, b.id + 11, 1.0)

    const furnace = this.rotateOffset(0.62, 1.32, rotation)
    const stocked = b.inventory.food > 0 || b.inventory.ale > 0
    this.warmWindow(b.x + furnace.x, 1.08, b.z + furnace.z, rotation, night * (stocked ? 0.62 : 0.24), 0.34, 0.4)

    const production = BUILDINGS.brewery.production!
    const active = productionPhaseActive
      && b.inventory[production.inputResource] >= production.inputAmount
      && b.inventory[production.outputResource] + production.outputAmount <= production.outputCapacity
    const furnaceHeat = active ? Math.max(0.34, night) : stocked ? night * 0.42 : 0
    this.warmGroundPool(b.x, b.z + 0.15, 1.9, active ? 0.55 : 0.28, furnaceHeat)
    if (active) {
      this.instanceFn('glow', b.x + furnace.x, 0.85, b.z + furnace.z, 0.68, 0.34, 0.68, 0xffa04c)
      for (let i = 0; i < 3; i++) {
        const drift = Math.sin(time * 0.85 + b.id * 0.7 + i) * 0.22
        const rise = (time * 0.24 + i * 0.34) % 1
        this.instanceFn('smoke', b.x + chimney.x + drift, 3.25 + rise * 1.9, b.z + chimney.z + i * 0.04, 0.5 + rise * 0.5, 0.42 + rise * 0.42, 0.5 + rise * 0.5, night > 0.6 ? 0x59606d : 0x85847f)
      }
    }
  }

  renderBlacksmith(
    b: Building,
    rotation: number,
    color: number,
    time: number,
    night: number,
    productionPhaseActive: boolean,
  ): void {
    this.renderYard(b, rotation, 3.0, 0x584c3d)
    this.timberFrame(b, rotation, 2.72, 2.48, 1.78, color, this.readableNightColor(TOWN_PALETTE.roofDark, night), 1.05)

    const front = this.rotateOffset(-0.45, 1.26, rotation)
    this.instanceFn('doors', b.x + front.x, 0.78, b.z + front.z, 0.68, 1.4, 0.14, 0x3f322a, rotation)
    const chimney = this.rotateOffset(0.88, -0.62, rotation)
    this.instanceFn('stone', b.x + chimney.x, 2.48, b.z + chimney.z, 0.46, 1.95, 0.46, 0x505257, rotation)

    const forge = this.rotateOffset(0.64, 1.36, rotation)
    this.instanceFn('stone', b.x + forge.x, 0.48, b.z + forge.z, 0.9, 0.72, 0.72, 0x575552, rotation)
    const anvil = this.rotateOffset(-0.76, 1.4, rotation)
    this.instanceFn('metal', b.x + anvil.x, 0.52, b.z + anvil.z, 0.76, 0.2, 0.38, 0x586169, rotation)
    this.instanceFn('timber', b.x + anvil.x, 0.28, b.z + anvil.z, 0.3, 0.56, 0.3, 0x4a3628, rotation)

    const orePile = this.rotateOffset(1.08, 0.78, rotation)
    for (let i = 0; i < 4; i++) {
      this.instanceFn('ore', b.x + orePile.x + (i % 2) * 0.28, 0.19 + Math.floor(i / 2) * 0.13, b.z + orePile.z + Math.floor(i / 2) * 0.25, 0.4, 0.34, 0.4, 0x68717a, rotation + i)
    }

    const toolRack = this.rotateOffset(-1.22, 0.18, rotation)
    this.instanceFn('timber', b.x + toolRack.x, 0.6, b.z + toolRack.z, 0.12, 1.15, 0.12, 0x4f3828, rotation)
    for (let i = 0; i < 3; i++) {
      const p = this.rotateOffset(-1.08, -0.12 + i * 0.28, rotation)
      this.instanceFn('metal', b.x + p.x, 0.58 + i * 0.14, b.z + p.z, 0.52, 0.07, 0.08, 0x70777b, rotation + (i - 1) * 0.2)
    }

    const canopy = this.rotateOffset(-0.1, 1.72, rotation)
    this.instanceFn('gableRoofs', b.x + canopy.x, 1.18, b.z + canopy.z, 2.72, 0.52, 1.2, this.readableNightColor(0x584638, night), rotation)
    for (const lx of [-1.08, 1.08]) {
      const post = this.rotateOffset(lx, 1.72, rotation)
      this.instanceFn('timber', b.x + post.x, 0.68, b.z + post.z, 0.1, 1.36, 0.1, 0x493327, rotation)
    }
    const lintel = this.rotateOffset(-0.1, 1.9, rotation)
    this.instanceFn('timber', b.x + lintel.x, 1.28, b.z + lintel.z, 2.42, 0.12, 0.12, 0x503727, rotation)
    const coal = this.rotateOffset(1.24, -0.1, rotation)
    for (let i = 0; i < 4; i++) {
      this.instanceFn('ore', b.x + coal.x + (i % 2) * 0.24, 0.12 + Math.floor(i / 2) * 0.1, b.z + coal.z + Math.floor(i / 2) * 0.2, 0.28, 0.24, 0.28, 0x3f4549, rotation + i)
    }
    this.renderCart(b, rotation, -1.7, -0.45, b.id + 5)

    const production = BUILDINGS.blacksmith.production!
    const active = productionPhaseActive
      && b.inventory[production.inputResource] >= production.inputAmount
      && b.inventory[production.outputResource] + production.outputAmount <= production.outputCapacity
    const stocked = b.inventory.ore > 0 || b.inventory.tools > 0
    this.warmWindow(b.x + forge.x, 0.92, b.z + forge.z, rotation, active ? 1 : night * (stocked ? 0.3 : 0.08), 0.48, 0.38)

    if (active) {
      const pulse = 0.92 + Math.sin(time * 8.5 + b.id) * 0.08
      this.instanceFn('glow', b.x + forge.x, 0.82, b.z + forge.z, 0.74 * pulse, 0.32, 0.74 * pulse, 0xff853d)
      this.warmGroundPool(b.x + forge.x, b.z + forge.z, 2.4, 0.38, Math.max(night, 0.42))
      for (let i = 0; i < 2; i++) {
        const drift = Math.sin(time * 1.05 + b.id * 0.5 + i) * 0.16
        const rise = (time * 0.28 + i * 0.5) % 1
        this.instanceFn('smoke', b.x + chimney.x + drift, 3.45 + rise * 1.7, b.z + chimney.z, 0.44 + rise * 0.42, 0.38 + rise * 0.36, 0.44 + rise * 0.42, night > 0.6 ? 0x555e68 : 0x787b7d)
      }
    }
  }

  renderFarmhouse(b: Building, rotation: number, color: number, night: number): void {
    this.renderYard(b, rotation, 3.25, 0x695941)
    this.timberFrame(b, rotation, 3.0, 2.7, 1.72, color, this.readableNightColor(0x5f4a37, night), 1.04)

    const frontDoor = this.rotateOffset(-0.46, 1.38, rotation)
    this.instanceFn('doors', b.x + frontDoor.x, 0.8, b.z + frontDoor.z, 0.72, 1.45, 0.14, 0x4b3325, rotation)
    const window = this.rotateOffset(0.66, 1.41, rotation)
    this.framedWindow(b.x + window.x, 1.18, b.z + window.z, rotation, night * 0.72, 0.34, 0.42, b.id + 43)

    const lean = this.rotateOffset(-1.72, -0.2, rotation)
    this.instanceFn('timber', b.x + lean.x, 0.62, b.z + lean.z, 1.15, 1.14, 2.05, 0x654932, rotation)
    this.instanceFn('gableRoofs', b.x + lean.x, 1.24, b.z + lean.z, 1.45, 0.48, 2.28, this.readableNightColor(0x66503b, night), rotation)

    for (const [lx, lz] of [[1.22, -0.9], [1.36, -0.3], [1.18, 0.28]] as const) {
      const sack = this.rotateOffset(lx, lz, rotation)
      this.instanceFn('sacks', b.x + sack.x, 0.26, b.z + sack.z, 0.48, 0.58, 0.44, 0xa38c61, rotation)
    }
    const basket = this.rotateOffset(1.3, 0.78, rotation)
    this.instanceFn('baskets', b.x + basket.x, 0.22, b.z + basket.z, 0.58, 0.74, 0.58, 0x9c7448, rotation)

    this.fenceLine(b, rotation, -1.75, -1.75, 3.5, false)
    this.fenceLine(b, rotation, 0, -2.25, 3.8, true)
    this.renderCart(b, rotation, -1.9, 1.0, b.id + 29)
    this.frontageClutter(b, rotation, b.id + 37, 0.94)
  }


  renderForestersLodge(b: Building, rotation: number, color: number, night: number): void {
    this.renderYard(b, rotation, 3.1, 0x5f573d)
    this.timberFrame(b, rotation, 2.65, 2.42, 1.62, color, this.readableNightColor(0x554434, night), 1.0)
    const door = this.rotateOffset(-0.45, 1.24, rotation)
    this.instanceFn('doors', b.x + door.x, 0.76, b.z + door.z, 0.64, 1.34, 0.14, 0x463124, rotation)
    const win = this.rotateOffset(0.54, 1.27, rotation)
    this.framedWindow(b.x + win.x, 1.12, b.z + win.z, rotation, night * 0.55, 0.32, 0.38, b.id + 71)
    for (let i = 0; i < 6; i++) {
      const p = this.rotateOffset(-1.25 + (i % 3) * 0.42, -1.18 + Math.floor(i / 3) * 0.38, rotation)
      this.instanceFn('logs', b.x + p.x, 0.18 + Math.floor(i / 3) * 0.16, b.z + p.z, 0.7, 0.6, 0.6, 0x69462e, rotation)
    }
    const rack = this.rotateOffset(1.2, -0.72, rotation)
    this.instanceFn('timber', b.x + rack.x, 0.62, b.z + rack.z, 0.12, 1.2, 0.12, 0x4c3527, rotation)
    for (let i = 0; i < 3; i++) {
      const sapling = this.rotateOffset(0.9 + i * 0.34, -1.38, rotation)
      this.instanceFn('treeTrunk', b.x + sapling.x, 0.25, b.z + sapling.z, 0.28, 0.5, 0.28, 0x573e2b, rotation)
      this.instanceFn('wood', b.x + sapling.x, 0.62, b.z + sapling.z, 0.42, 0.5, 0.42, 0x526b48, rotation)
    }
    this.frontageClutter(b, rotation, b.id + 67, 0.9)
  }

  renderMine(b: Building, rotation: number, color: number, night: number): void {
    this.renderYard(b, rotation, 3.2, 0x514b42)
    const portal = this.rotateOffset(0, -0.35, rotation)
    this.instanceFn('stone', b.x + portal.x, 0.5, b.z + portal.z, 2.5, 0.9, 1.9, 0x565653, rotation)
    this.instanceFn('timber', b.x + portal.x, 1.05, b.z + portal.z, 2.2, 0.18, 0.18, 0x493426, rotation)
    for (const lx of [-0.92, 0.92]) {
      const post = this.rotateOffset(lx, -0.2, rotation)
      this.instanceFn('timber', b.x + post.x, 1.1, b.z + post.z, 0.2, 2.2, 0.2, 0x493426, rotation)
    }
    const beam = this.rotateOffset(0, 0.28, rotation)
    this.instanceFn('timber', b.x + beam.x, 2.1, b.z + beam.z, 2.45, 0.2, 0.2, 0x51382a, rotation)
    const hoist = this.rotateOffset(0, 0.2, rotation)
    this.instanceFn('metal', b.x + hoist.x, 1.42, b.z + hoist.z, 0.16, 1.16, 0.16, 0x5b6266, rotation)
    for (let i = 0; i < 7; i++) {
      const ore = this.rotateOffset(1.0 + (i % 3) * 0.28, 0.7 + Math.floor(i / 3) * 0.25, rotation)
      this.instanceFn('ore', b.x + ore.x, 0.18 + Math.floor(i / 3) * 0.11, b.z + ore.z, 0.42, 0.34, 0.42, i % 2 ? 0x656d75 : 0x737a82, rotation + i)
    }
    this.renderCart(b, rotation, -1.55, 0.75, b.id + 79)
    const lamp = this.rotateOffset(-0.72, 0.55, rotation)
    this.warmWindow(b.x + lamp.x, 1.24, b.z + lamp.z, rotation, night, 0.28, 0.28)
    this.frontageClutter(b, rotation, b.id + 83, 0.8)
  }

  renderOreYard(b: Building, rotation: number, color: number): void {
    this.renderYard(b, rotation, 3.35, 0x555049)
    this.fenceLine(b, rotation, -1.72, -1.75, 3.45, false)
    this.fenceLine(b, rotation, 0, -1.82, 3.45, true)
    for (let i = 0; i < 12; i++) {
      const p = this.rotateOffset(-1.12 + (i % 4) * 0.48, -0.82 + Math.floor(i / 4) * 0.43, rotation)
      const height = 0.16 + Math.floor(i / 4) * 0.11
      this.instanceFn('ore', b.x + p.x, height, b.z + p.z, 0.52, 0.4, 0.52, i % 3 === 0 ? 0x788087 : 0x646c73, rotation + i)
    }
    const crane = this.rotateOffset(1.1, 0.15, rotation)
    this.instanceFn('timber', b.x + crane.x, 1.18, b.z + crane.z, 0.18, 2.3, 0.18, 0x4f3929, rotation)
    const arm = this.rotateOffset(0.45, 0.15, rotation)
    this.instanceFn('timber', b.x + arm.x, 2.15, b.z + arm.z, 1.55, 0.16, 0.16, 0x573d2c, rotation)
    this.instanceFn('metal', b.x + crane.x, 1.48, b.z + crane.z, 0.09, 1.0, 0.09, 0x5e666b, rotation)
    this.renderCart(b, rotation, 1.65, 1.05, b.id + 89)
  }

  renderFishingHut(b: Building, rotation: number, color: number, night: number): void {
    this.renderYard(b, rotation, 2.95, 0x625945)
    this.timberFrame(b, rotation, 2.55, 2.25, 1.48, color, this.readableNightColor(0x5a493a, night), 0.92)
    const door = this.rotateOffset(-0.42, 1.14, rotation)
    this.instanceFn('doors', b.x + door.x, 0.72, b.z + door.z, 0.6, 1.24, 0.14, 0x463226, rotation)
    for (const [lx, lz] of [[1.05, 0.85], [1.25, 0.25], [0.95, -0.38]] as const) {
      const basket = this.rotateOffset(lx, lz, rotation)
      this.instanceFn('baskets', b.x + basket.x, 0.2, b.z + basket.z, 0.62, 0.62, 0.62, 0x927045, rotation)
    }
    const rack = this.rotateOffset(-1.35, -0.15, rotation)
    for (const lx of [-0.42, 0.42]) {
      const post = this.rotateOffset(-1.35 + lx, -0.15, rotation)
      this.instanceFn('timber', b.x + post.x, 0.76, b.z + post.z, 0.1, 1.48, 0.1, 0x4d3729, rotation)
    }
    this.instanceFn('timber', b.x + rack.x, 1.43, b.z + rack.z, 1.05, 0.1, 0.1, 0x553c2c, rotation)
    const net = this.rotateOffset(-1.35, 0.0, rotation)
    this.instanceFn('cloth', b.x + net.x, 0.83, b.z + net.z, 1.0, 0.06, 1.12, 0x7d7a61, rotation)
    for (let i = 0; i < 3; i++) {
      const barrel = this.rotateOffset(-0.75 + i * 0.52, 1.34, rotation)
      this.instanceFn('barrels', b.x + barrel.x, 0.3, b.z + barrel.z, 0.38, 0.6, 0.38, 0x6c4b32, rotation)
    }
    this.frontageClutter(b, rotation, b.id + 97, 0.82)
  }

  renderPleasureHouse(b: Building, rotation: number, color: number, night: number, time: number, activity: number): void {
    this.renderYard(b, rotation, 3.25, 0x675044)
    this.timberFrame(b, rotation, 3.0, 2.72, 2.08, color, this.readableNightColor(0x503741, night), 1.3)
    const door = this.rotateOffset(0, 1.42, rotation)
    this.instanceFn('doors', b.x + door.x, 0.88, b.z + door.z, 0.72, 1.5, 0.14, 0x3f2928, rotation)
    for (const [index, lx] of [-0.84, 0.84].entries()) {
      const win = this.rotateOffset(lx, 1.46, rotation)
      this.framedWindow(b.x + win.x, 1.34, b.z + win.z, rotation, night, 0.42, 0.52, b.id + 110 + index)
    }
    const canopy = this.rotateOffset(0, 1.76, rotation)
    this.instanceFn('cloth', b.x + canopy.x, 1.72, b.z + canopy.z, 2.55, 0.1, 0.82, 0x7b3f55, rotation)
    const signPost = this.rotateOffset(1.48, 1.05, rotation)
    this.instanceFn('timber', b.x + signPost.x, 1.35, b.z + signPost.z, 0.11, 1.65, 0.11, 0x493126, rotation)
    this.instanceFn('cloth', b.x + signPost.x, 1.8, b.z + signPost.z, 0.7, 0.52, 0.06, 0x8d4962, rotation)
    if (night > 0.12 && b.inventory.ale > 0) {
      this.instanceFn('glow', b.x + signPost.x, 1.65, b.z + signPost.z, 0.34, 0.28, 0.34, 0xffb060)
      this.warmGroundPool(b.x, b.z + 0.8, 5.4, 0.46, night)
    }
    if (activity > 0.15) {
      for (let i = 0; i < 2; i++) {
        const o = this.rotateOffset(-0.48 + i * 0.96, 1.92 + Math.sin(time * 0.5 + i) * 0.1, rotation)
        this.instanceFn('entertainer', b.x + o.x, 0.46, b.z + o.z, 0.72, 0.95, 0.72, i ? 0x6f4861 : 0x87546b, rotation + i * 0.2)
      }
    }
    for (const lx of [-1.1, 1.05]) {
      const barrel = this.rotateOffset(lx, 1.48, rotation)
      this.instanceFn('barrels', b.x + barrel.x, 0.32, b.z + barrel.z, 0.4, 0.64, 0.4, 0x704830, rotation)
    }
    this.frontageClutter(b, rotation, b.id + 121, 1.02)
  }

  renderFortification(b: Building, rotation: number, color: number): void {
    if (b.type === 'wood-wall') {
      // Vertical sharpened palisade stakes replace the old horizontal log-kit look.
      for (const [index, localX] of [-0.4, -0.2, 0, 0.2, 0.4].entries()) {
        const o = this.rotateOffset(localX, 0, rotation)
        const height = 1.44 + ((b.id + index) % 3) * 0.11
        this.instanceFn('treeTrunk', b.x + o.x, height / 2, b.z + o.z, 0.62, height, 0.62, color, rotation)
        this.instanceFn('wood', b.x + o.x, height + 0.11, b.z + o.z, 0.19, 0.24, 0.19, color, rotation)
      }
      for (const y of [0.52, 0.98]) {
        this.instanceFn('timber', b.x, y, b.z, 0.96, 0.1, 0.11, 0x513927, rotation)
      }
      return
    }

    const left = this.rotateOffset(-0.36, 0, rotation)
    const right = this.rotateOffset(0.36, 0, rotation)
    for (const p of [left, right]) {
      this.instanceFn('treeTrunk', b.x + p.x, 0.92, b.z + p.z, 0.72, 1.84, 0.72, color, rotation)
      this.instanceFn('wood', b.x + p.x, 1.9, b.z + p.z, 0.22, 0.28, 0.22, color, rotation)
    }
    for (const y of [0.48, 0.92, 1.36]) {
      this.instanceFn('timber', b.x, y, b.z, 1.16, 0.12, 0.12, 0x493326, rotation)
    }
    this.instanceFn('braceL', b.x - Math.cos(rotation) * 0.16, 0.94, b.z + Math.sin(rotation) * 0.16, 0.72, 0.1, 0.11, 0x5b402e, rotation)
    this.instanceFn('braceR', b.x + Math.cos(rotation) * 0.16, 0.94, b.z - Math.sin(rotation) * 0.16, 0.72, 0.1, 0.11, 0x5b402e, rotation)
    this.instanceFn('metal', b.x, 1.1, b.z, 0.82, 0.08, 0.08, 0x596066, rotation)
  }


}
