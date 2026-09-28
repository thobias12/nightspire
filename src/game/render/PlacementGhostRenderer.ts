import * as THREE from 'three'
import { BUILDINGS, type BuildingId } from '../data/buildings'
import type { Point } from '../model/WorldState'
import { plotCorners, type ResidentialPlotPreview } from '../world/TownPlanning'

export type RotateOffset = (x: number, z: number, angle: number) => Point

export class PlacementGhostRenderer {
  private readonly matrix = new THREE.Object3D()
  private readonly ghost: THREE.Mesh
  private readonly ghostLine: THREE.InstancedMesh
  private readonly facing: THREE.Mesh
  private readonly fieldGhostFill: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
  private readonly fieldAnchor: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>

  constructor(
    private readonly scene: THREE.Scene,
    private readonly grid: THREE.GridHelper,
    geometry: THREE.BufferGeometry,
    private readonly rotateOffset: RotateOffset,
  ) {
    this.ghost = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ color: 0x82d6a4, transparent: true, opacity: 0.38, depthWrite: false }),
    )
    this.ghost.visible = false
    this.scene.add(this.ghost)

    this.ghostLine = new THREE.InstancedMesh(
      geometry,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.38, depthWrite: false, vertexColors: true }),
      120,
    )
    this.ghostLine.count = 0
    this.ghostLine.visible = false
    this.ghostLine.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.ghostLine.frustumCulled = false
    this.scene.add(this.ghostLine)

    this.facing = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ color: 0xf1c86f, transparent: true, opacity: 0.9, depthWrite: false }),
    )
    this.facing.visible = false
    this.scene.add(this.facing)

    this.fieldGhostFill = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({ color: 0x9fba70, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false, depthTest: true }),
    )
    this.fieldGhostFill.visible = false
    this.fieldGhostFill.renderOrder = 11
    this.scene.add(this.fieldGhostFill)

    this.fieldAnchor = new THREE.Mesh(
      new THREE.RingGeometry(0.22, 0.34, 18).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xe4cf8d, transparent: true, opacity: 0.9, depthWrite: false }),
    )
    this.fieldAnchor.visible = false
    this.fieldAnchor.renderOrder = 21
    this.scene.add(this.fieldAnchor)
  }

  showGhost(
    type: BuildingId | null,
    p: Point | null,
    valid: boolean,
    rotationSteps = 0,
    dragPoints: Point[] = [],
    facingAngle: number | null = null,
  ): void {
    this.ghost.visible = false
    this.ghostLine.visible = false
    this.ghostLine.count = 0
    this.facing.visible = false
    this.fieldGhostFill.visible = false
    this.fieldAnchor.visible = false
    this.grid.visible = !!type
    if (!type || !p) return

    const def = BUILDINGS[type]
    const rotation = facingAngle ?? (((rotationSteps % 4) + 4) % 4 * Math.PI / 2)
    const height = def.fortification
      ? (type === 'wood-gate' ? 1.8 : 1.35)
      : type === 'house' ? 2.3
        : type === 'tavern' ? 2.05
          : type === 'brewery' || type === 'blacksmith' ? 1.95
            : type === 'guard-post' ? 1.6
              : 0.7
    const color = new THREE.Color(valid ? 0x77d9a0 : 0xef6d65)

    if (dragPoints.length > 1) {
      this.ghostLine.visible = true
      this.ghostLine.count = Math.min(dragPoints.length, 120)
      for (let i = 0; i < this.ghostLine.count; i++) {
        const point = dragPoints[i]
        this.matrix.position.set(point.x, height / 2, point.z)
        this.matrix.scale.set(type === 'wood-wall' ? 0.92 : def.footprint, height, type === 'wood-wall' ? 0.82 : def.footprint)
        this.matrix.rotation.set(0, rotation, 0)
        this.matrix.updateMatrix()
        this.ghostLine.setMatrixAt(i, this.matrix.matrix)
        this.ghostLine.setColorAt(i, color)
      }
      this.ghostLine.instanceMatrix.needsUpdate = true
      if (this.ghostLine.instanceColor) this.ghostLine.instanceColor.needsUpdate = true
    } else {
      this.ghost.visible = true
      this.ghost.position.set(p.x, def.fortification ? height / 2 : 0.055, p.z)
      this.ghost.rotation.set(0, rotation, 0)
      this.ghost.scale.set(
        def.fortification ? 0.92 : def.footprint * 0.94,
        def.fortification ? height : 0.08,
        def.fortification ? 0.82 : def.footprint * 0.94,
      )
      ;(this.ghost.material as THREE.MeshBasicMaterial).color.copy(
        new THREE.Color(def.fortification ? (valid ? 0x77d9a0 : 0xef6d65) : (valid ? 0xb8ae82 : 0xd96f68)),
      )

      if (!def.fortification) {
        const outlineColor = new THREE.Color(valid ? 0xeadfbd : 0xef756b)
        const iconColor = new THREE.Color(valid ? 0xf6e8bb : 0xffa59d)
        let count = 0
        const setSegment = (a: Point, b: Point, width = 0.065, lineColor = outlineColor, y = 0.09): void => {
          if (count >= 120) return
          const dx = b.x - a.x
          const dz = b.z - a.z
          const length = Math.max(0.02, Math.hypot(dx, dz))
          this.matrix.position.set((a.x + b.x) / 2, y, (a.z + b.z) / 2)
          this.matrix.scale.set(width, 0.04, length)
          this.matrix.rotation.set(0, Math.atan2(dx, dz), 0)
          this.matrix.updateMatrix()
          this.ghostLine.setMatrixAt(count, this.matrix.matrix)
          this.ghostLine.setColorAt(count, lineColor)
          count++
        }
        const dashed = (a: Point, b: Point): void => {
          const dx = b.x - a.x
          const dz = b.z - a.z
          const length = Math.hypot(dx, dz)
          if (length < 0.04) return
          const ux = dx / length
          const uz = dz / length
          for (let offset = 0; offset < length && count < 120; offset += 0.52 + 0.3) {
            const finish = Math.min(length, offset + 0.52)
            setSegment(
              { x: a.x + ux * offset, z: a.z + uz * offset },
              { x: a.x + ux * finish, z: a.z + uz * finish },
            )
          }
        }
        const corner = (x: number, z: number): Point => {
          const offset = this.rotateOffset(x, z, rotation)
          return { x: p.x + offset.x, z: p.z + offset.z }
        }
        const half = def.footprint / 2
        const corners = [
          corner(-half, -half),
          corner(half, -half),
          corner(half, half),
          corner(-half, half),
        ]
        for (let i = 0; i < corners.length; i++) dashed(corners[i], corners[(i + 1) % corners.length])

        const iconHalf = Math.min(0.38, def.footprint * 0.14)
        const iconScale = type === 'farmhouse' ? 1 : 0.9
        if (type === 'farmhouse') {
          setSegment(corner(-iconHalf, -iconHalf), corner(-iconHalf, iconHalf), 0.07, iconColor, 0.115)
          setSegment(corner(iconHalf, -iconHalf), corner(iconHalf, iconHalf), 0.07, iconColor, 0.115)
          setSegment(corner(-iconHalf, -iconHalf), corner(iconHalf, -iconHalf), 0.07, iconColor, 0.115)
          setSegment(corner(-iconHalf, iconHalf), corner(0, iconHalf + 0.3 * iconScale), 0.07, iconColor, 0.115)
          setSegment(corner(0, iconHalf + 0.3 * iconScale), corner(iconHalf, iconHalf), 0.07, iconColor, 0.115)
        } else {
          setSegment(corner(-iconHalf, -iconHalf), corner(iconHalf, -iconHalf), 0.065, iconColor, 0.115)
          setSegment(corner(iconHalf, -iconHalf), corner(iconHalf, iconHalf), 0.065, iconColor, 0.115)
          setSegment(corner(iconHalf, iconHalf), corner(-iconHalf, iconHalf), 0.065, iconColor, 0.115)
          setSegment(corner(-iconHalf, iconHalf), corner(-iconHalf, -iconHalf), 0.065, iconColor, 0.115)
          setSegment(corner(-iconHalf * 0.55, 0), corner(iconHalf * 0.55, 0), 0.055, iconColor, 0.115)
          setSegment(corner(0, -iconHalf * 0.55), corner(0, iconHalf * 0.55), 0.055, iconColor, 0.115)
        }

        this.ghostLine.visible = count > 0
        this.ghostLine.count = count
        this.ghostLine.instanceMatrix.needsUpdate = true
        if (this.ghostLine.instanceColor) this.ghostLine.instanceColor.needsUpdate = true
      }
    }

    if (!def.fortification) {
      const distance = def.footprint / 2 + 0.65
      this.facing.visible = true
      this.facing.position.set(
        p.x + Math.sin(rotation) * distance,
        0.08,
        p.z + Math.cos(rotation) * distance,
      )
      this.facing.rotation.set(0, rotation, 0)
      this.facing.scale.set(0.82, 0.09, 0.18)
    }
  }

  showRoadGhost(points: Point[], valid: boolean, showGrid = false, width = 1.7): void {
    this.ghost.visible = false
    this.ghostLine.visible = false
    this.ghostLine.count = 0
    this.facing.visible = false
    this.fieldGhostFill.visible = false
    this.fieldAnchor.visible = false
    this.grid.visible = showGrid
    if (points.length === 0) return

    const color = new THREE.Color(valid ? 0xcaa56c : 0xef6d65)
    const markerColor = new THREE.Color(valid ? 0xf4dfb1 : 0xff9b91)

    if (points.length >= 2) {
      this.ghostLine.visible = true
      this.ghostLine.count = Math.min(points.length - 1, 120)
      for (let i = 0; i < this.ghostLine.count; i++) {
        const a = points[i]
        const b = points[i + 1]
        const dx = b.x - a.x
        const dz = b.z - a.z
        const length = Math.max(0.05, Math.hypot(dx, dz))
        this.matrix.position.set((a.x + b.x) / 2, 0.055, (a.z + b.z) / 2)
        this.matrix.scale.set(width, 0.07, length + 0.18)
        this.matrix.rotation.set(0, Math.atan2(dx, dz), 0)
        this.matrix.updateMatrix()
        this.ghostLine.setMatrixAt(i, this.matrix.matrix)
        this.ghostLine.setColorAt(i, color)
      }
      this.ghostLine.instanceMatrix.needsUpdate = true
      if (this.ghostLine.instanceColor) this.ghostLine.instanceColor.needsUpdate = true
    }

    const first = points[0]
    const last = points[points.length - 1]
    this.ghost.visible = true
    this.ghost.position.set(first.x, 0.09, first.z)
    this.ghost.rotation.set(0, 0, 0)
    this.ghost.scale.set(0.26, 0.1, 0.26)
    ;(this.ghost.material as THREE.MeshBasicMaterial).color.copy(markerColor)

    this.facing.visible = true
    this.facing.position.set(last.x, 0.095, last.z)
    this.facing.rotation.set(0, 0, 0)
    this.facing.scale.set(0.34, 0.1, 0.34)
    ;(this.facing.material as THREE.MeshBasicMaterial).color.copy(markerColor)
  }

  showFieldGhost(points: Point[], valid: boolean, showGrid = false): void {
    this.ghost.visible = false
    this.ghostLine.visible = false
    this.ghostLine.count = 0
    this.facing.visible = false
    this.fieldGhostFill.visible = false
    this.fieldAnchor.visible = false
    this.grid.visible = showGrid
    if (points.length === 0) return

    const color = new THREE.Color(valid ? 0xbfa66a : 0xe46f66)
    const markerColor = new THREE.Color(valid ? 0xe7d18c : 0xff9b91)

    if (points.length >= 3) {
      this.fieldGhostFill.geometry.dispose()
      const shape = new THREE.Shape()
      points.forEach((point, index) => {
        if (index === 0) shape.moveTo(point.x, -point.z)
        else shape.lineTo(point.x, -point.z)
      })
      shape.closePath()
      const geometry = new THREE.ShapeGeometry(shape)
      geometry.rotateX(-Math.PI / 2)
      this.fieldGhostFill.geometry = geometry
      this.fieldGhostFill.position.y = 0.062
      this.fieldGhostFill.material.color.set(valid ? 0x91a968 : 0xd36a64)
      this.fieldGhostFill.material.opacity = valid ? 0.16 : 0.2
      this.fieldGhostFill.visible = true
    }

    this.fieldAnchor.position.set(points[0].x, 0.105, points[0].z)
    this.fieldAnchor.material.color.copy(markerColor)
    this.fieldAnchor.visible = true
    const segmentCount = points.length >= 3 ? points.length : Math.max(0, points.length - 1)
    if (segmentCount > 0) {
      this.ghostLine.visible = true
      this.ghostLine.count = Math.min(segmentCount, 120)
      for (let i = 0; i < this.ghostLine.count; i++) {
        const a = points[i]
        const b = points[(i + 1) % points.length]
        const dx = b.x - a.x
        const dz = b.z - a.z
        const length = Math.max(0.05, Math.hypot(dx, dz))
        this.matrix.position.set((a.x + b.x) / 2, 0.065, (a.z + b.z) / 2)
        this.matrix.scale.set(0.11, 0.075, length)
        this.matrix.rotation.set(0, Math.atan2(dx, dz), 0)
        this.matrix.updateMatrix()
        this.ghostLine.setMatrixAt(i, this.matrix.matrix)
        this.ghostLine.setColorAt(i, color)
      }
      this.ghostLine.instanceMatrix.needsUpdate = true
      if (this.ghostLine.instanceColor) this.ghostLine.instanceColor.needsUpdate = true
    }

  }

  showResidentialPlotGhost(preview: ResidentialPlotPreview | null, valid: boolean, showGrid = false): void {
    this.ghost.visible = false
    this.ghostLine.visible = false
    this.ghostLine.count = 0
    this.facing.visible = false
    this.fieldGhostFill.visible = false
    this.fieldAnchor.visible = false
    this.grid.visible = showGrid
    if (!preview) return

    const outlineColor = new THREE.Color(valid ? 0xeadfbd : 0xef756b)
    const iconColor = new THREE.Color(valid ? 0xf6e8bb : 0xffa59d)
    const secondaryColor = new THREE.Color(valid ? 0xd4c59a : 0xe98a83)
    const corners = plotCorners(preview)

    const shape = new THREE.Shape()
    corners.forEach((point, index) => {
      if (index === 0) shape.moveTo(point.x, -point.z)
      else shape.lineTo(point.x, -point.z)
    })
    shape.closePath()
    this.fieldGhostFill.geometry.dispose()
    const fillGeometry = new THREE.ShapeGeometry(shape)
    fillGeometry.rotateX(-Math.PI / 2)
    this.fieldGhostFill.geometry = fillGeometry
    this.fieldGhostFill.position.y = 0.052
    this.fieldGhostFill.material.color.set(valid ? 0xb8b481 : 0xc96961)
    this.fieldGhostFill.material.opacity = valid ? 0.09 : 0.14
    this.fieldGhostFill.visible = true

    let count = 0
    const setSegment = (a: Point, b: Point, width = 0.07, color = outlineColor, y = 0.09): void => {
      if (count >= 120) return
      const dx = b.x - a.x
      const dz = b.z - a.z
      const length = Math.max(0.02, Math.hypot(dx, dz))
      this.matrix.position.set((a.x + b.x) / 2, y, (a.z + b.z) / 2)
      this.matrix.scale.set(width, 0.04, length)
      this.matrix.rotation.set(0, Math.atan2(dx, dz), 0)
      this.matrix.updateMatrix()
      this.ghostLine.setMatrixAt(count, this.matrix.matrix)
      this.ghostLine.setColorAt(count, color)
      count++
    }
    const dashed = (a: Point, b: Point, dash = 0.58, gap = 0.34, width = 0.07, color = outlineColor): void => {
      const dx = b.x - a.x
      const dz = b.z - a.z
      const length = Math.hypot(dx, dz)
      if (length < 0.04) return
      const ux = dx / length
      const uz = dz / length
      for (let offset = 0; offset < length && count < 120; offset += dash + gap) {
        const finish = Math.min(length, offset + dash)
        setSegment(
          { x: a.x + ux * offset, z: a.z + uz * offset },
          { x: a.x + ux * finish, z: a.z + uz * finish },
          width,
          color,
        )
      }
    }

    for (let i = 0; i < corners.length; i++) dashed(corners[i], corners[(i + 1) % corners.length])

    const dx = preview.frontageB.x - preview.frontageA.x
    const dz = preview.frontageB.z - preview.frontageA.z
    const frontageLength = Math.max(0.001, Math.hypot(dx, dz))
    const tx = dx / frontageLength
    const tz = dz / frontageLength
    const rear = { x: -tz * preview.side, z: tx * preview.side }
    const houseBack = Math.min(preview.depth - 1.4, Math.max(3.0, preview.depth * 0.48))
    const dividerA = {
      x: preview.frontageA.x + rear.x * houseBack,
      z: preview.frontageA.z + rear.z * houseBack,
    }
    const dividerB = {
      x: preview.frontageB.x + rear.x * houseBack,
      z: preview.frontageB.z + rear.z * houseBack,
    }
    dashed(dividerA, dividerB, 0.44, 0.3, 0.055, secondaryColor)

    const local = (center: Point, x: number, z: number, scale = 1): Point => {
      const offset = this.rotateOffset(x * scale, z * scale, preview.angle)
      return { x: center.x + offset.x, z: center.z + offset.z }
    }

    const house = preview.housePoint
    const h = 0.42
    const houseScale = 0.95
    setSegment(local(house, -h, -0.3, houseScale), local(house, -h, 0.38, houseScale), 0.075, iconColor, 0.115)
    setSegment(local(house, h, -0.3, houseScale), local(house, h, 0.38, houseScale), 0.075, iconColor, 0.115)
    setSegment(local(house, -h, -0.3, houseScale), local(house, h, -0.3, houseScale), 0.075, iconColor, 0.115)
    setSegment(local(house, -h, 0.38, houseScale), local(house, 0, 0.72, houseScale), 0.075, iconColor, 0.115)
    setSegment(local(house, 0, 0.72, houseScale), local(house, h, 0.38, houseScale), 0.075, iconColor, 0.115)
    setSegment(local(house, -0.12, -0.3, houseScale), local(house, -0.12, 0.0, houseScale), 0.06, iconColor, 0.115)
    setSegment(local(house, 0.12, -0.3, houseScale), local(house, 0.12, 0.0, houseScale), 0.06, iconColor, 0.115)

    const frontMid = {
      x: (preview.frontageA.x + preview.frontageB.x) / 2,
      z: (preview.frontageA.z + preview.frontageB.z) / 2,
    }
    const rearIcon = {
      x: frontMid.x + rear.x * Math.max(houseBack + 1.0, preview.depth * 0.77),
      z: frontMid.z + rear.z * Math.max(houseBack + 1.0, preview.depth * 0.77),
    }
    const e = 0.3
    setSegment(local(rearIcon, -e, -e, 0.9), local(rearIcon, e, -e, 0.9), 0.06, iconColor, 0.112)
    setSegment(local(rearIcon, e, -e, 0.9), local(rearIcon, e, e, 0.9), 0.06, iconColor, 0.112)
    setSegment(local(rearIcon, e, e, 0.9), local(rearIcon, -e, e, 0.9), 0.06, iconColor, 0.112)
    setSegment(local(rearIcon, -e, e, 0.9), local(rearIcon, -e, -e, 0.9), 0.06, iconColor, 0.112)
    setSegment(local(rearIcon, -0.18, 0, 0.9), local(rearIcon, 0.18, 0, 0.9), 0.052, iconColor, 0.112)
    setSegment(local(rearIcon, 0, -0.18, 0.9), local(rearIcon, 0, 0.18, 0.9), 0.052, iconColor, 0.112)

    this.ghostLine.visible = count > 0
    this.ghostLine.count = count
    this.ghostLine.instanceMatrix.needsUpdate = true
    if (this.ghostLine.instanceColor) this.ghostLine.instanceColor.needsUpdate = true

    this.facing.visible = true
    this.facing.position.set(frontMid.x, 0.105, frontMid.z)
    this.facing.rotation.set(0, preview.angle, 0)
    this.facing.scale.set(Math.min(1.0, Math.max(0.68, preview.width * 0.16)), 0.065, 0.18)
    ;(this.facing.material as THREE.MeshBasicMaterial).color.copy(iconColor)
  }


}
