import * as THREE from 'three'
import type { FieldPlot } from '../model/WorldState'
import { pointInPolygon } from '../world/FieldPlanning'

export type FieldInstanceFn = (
  name: string, x: number, y: number, z: number,
  sx?: number, sy?: number, sz?: number, color?: number, rotation?: number,
) => void

export class FieldRenderer {
  private readonly fieldGrounds = new Map<number, {
    mesh: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshStandardMaterial>
    signature: string
  }>()
  private readonly selection: THREE.LineLoop<THREE.BufferGeometry, THREE.LineBasicMaterial>

  constructor(
    private readonly scene: THREE.Scene,
    private readonly instanceFn: FieldInstanceFn,
  ) {
    this.selection = new THREE.LineLoop(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xd7bb7a, transparent: true, opacity: 0.82, depthTest: true, depthWrite: false }),
    )
    this.selection.visible = false
    this.selection.renderOrder = 20
    this.scene.add(this.selection)
  }

  private fieldGroundColor(field: FieldPlot): number {
    return field.phase === 'ready'
      ? 0x887551
      : field.phase === 'growing'
        ? 0x745f45
        : field.phase === 'sown'
          ? 0x705a42
          : field.phase === 'harvested'
            ? 0x857052
            : 0x795f46
  }

  private syncFieldGrounds(fields: FieldPlot[]): void {
    const visible = new Set(fields.map(field => field.id))
    for (const [id, entry] of this.fieldGrounds) {
      if (visible.has(id)) continue
      this.scene.remove(entry.mesh)
      entry.mesh.geometry.dispose()
      entry.mesh.material.dispose()
      this.fieldGrounds.delete(id)
    }

    for (const field of fields) {
      const signature = field.points.map(point => point.x.toFixed(3) + ',' + point.z.toFixed(3)).join('|')
      let entry = this.fieldGrounds.get(field.id)
      if (!entry || entry.signature !== signature) {
        if (entry) {
          this.scene.remove(entry.mesh)
          entry.mesh.geometry.dispose()
          entry.mesh.material.dispose()
        }
        const shape = new THREE.Shape()
        field.points.forEach((point, index) => {
          if (index === 0) shape.moveTo(point.x, -point.z)
          else shape.lineTo(point.x, -point.z)
        })
        shape.closePath()
        const geometry = new THREE.ShapeGeometry(shape)
        geometry.rotateX(-Math.PI / 2)
        const material = new THREE.MeshStandardMaterial({
          color: this.fieldGroundColor(field),
          roughness: 1,
          metalness: 0,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        })
        const mesh = new THREE.Mesh(geometry, material)
        mesh.position.y = 0.022
        mesh.receiveShadow = true
        mesh.castShadow = false
        mesh.renderOrder = 1
        this.scene.add(mesh)
        entry = { mesh, signature }
        this.fieldGrounds.set(field.id, entry)
      }
      entry.mesh.material.color.setHex(this.fieldGroundColor(field))
    }
  }

  render(fields: FieldPlot[]): void {
    this.syncFieldGrounds(fields)

    for (const field of fields) {
      // Break up the large polygon with low-contrast soil mottling. These patches are
      // deterministic so the field never shimmers or changes pattern with camera distance.
      const minFieldX = Math.min(...field.points.map(point => point.x))
      const maxFieldX = Math.max(...field.points.map(point => point.x))
      const minFieldZ = Math.min(...field.points.map(point => point.z))
      const maxFieldZ = Math.max(...field.points.map(point => point.z))
      const patchCount = Math.max(4, Math.min(18, Math.round(field.area / 11)))
      for (let patch = 0; patch < patchCount; patch++) {
        const seed = field.id * 19.37 + patch * 7.91
        const u = (Math.sin(seed * 1.31) * 0.5 + 0.5)
        const v = (Math.cos(seed * 1.77) * 0.5 + 0.5)
        const point = {
          x: minFieldX + (maxFieldX - minFieldX) * u,
          z: minFieldZ + (maxFieldZ - minFieldZ) * v,
        }
        if (!pointInPolygon(point, field.points)) continue
        const radius = 0.75 + (Math.sin(seed * 2.11) * 0.5 + 0.5) * 1.35
        const patchColor = patch % 3 === 0
          ? 0x8a7154
          : patch % 3 === 1
            ? 0x6f5943
            : 0x80674c
        this.instanceFn('fieldSoilPatch', point.x, 0.037, point.z, radius, 1, radius * 0.72, patchColor, seed)
      }
      let edgeA = field.points[0]
      let edgeB = field.points[1] ?? field.points[0]
      let edgeLength = 0
      for (let i = 0; i < field.points.length; i++) {
        const a = field.points[i]
        const b = field.points[(i + 1) % field.points.length]
        const length = Math.hypot(b.x - a.x, b.z - a.z)
        if (length > edgeLength) {
          edgeLength = length
          edgeA = a
          edgeB = b
        }
      }

      const length = Math.max(0.001, Math.hypot(edgeB.x - edgeA.x, edgeB.z - edgeA.z))
      const tx = (edgeB.x - edgeA.x) / length
      const tz = (edgeB.z - edgeA.z) / length
      const nx = -tz
      const nz = tx
      const rowRotation = Math.atan2(-tz, tx)
      const projections = field.points.map(point => ({
        t: point.x * tx + point.z * tz,
        n: point.x * nx + point.z * nz,
      }))
      const minT = Math.min(...projections.map(point => point.t))
      const maxT = Math.max(...projections.map(point => point.t))
      const minN = Math.min(...projections.map(point => point.n))
      const maxN = Math.max(...projections.map(point => point.n))
      const rowSpacing = field.phase === 'ready'
        ? 0.58
        : field.phase === 'growing'
          ? 0.64
          : field.phase === 'sown'
            ? 0.7
            : 0.76
      const sampleStep = 0.24

      const furrowColor = field.phase === 'ready'
        ? 0x816b4e
        : field.phase === 'growing'
          ? 0x765f47
          : 0x725b44
      const cropColor = field.phase === 'ready'
        ? 0xc5aa63
        : field.phase === 'growing'
          ? 0x7d8d55
          : field.phase === 'sown'
            ? 0x758451
            : 0xa18b5b
      const cropScale = field.phase === 'ready'
        ? 1.28
        : field.phase === 'growing'
          ? 0.92
          : field.phase === 'sown'
            ? 0.32
            : field.phase === 'harvested'
              ? 0.24
              : 0
      const drawFurrows = field.phase === 'sown' || field.phase === 'growing' || field.phase === 'ready'

      const emitRow = (t0: number, t1: number, n: number, row: number): void => {
        const segmentLength = t1 - t0
        if (segmentLength < 0.42) return
        const t = (t0 + t1) / 2
        const x = tx * t + nx * n
        const z = tz * t + nz * n
        const rowJitter = Math.sin(field.id * 2.41 + row * 1.73) * 0.035

        if (drawFurrows) {
          this.instanceFn(
            'fieldFurrow',
            x + nx * rowJitter,
            0.051,
            z + nz * rowJitter,
            Math.max(0.3, segmentLength * 0.97),
            1,
            0.12,
            furrowColor,
            rowRotation,
          )
        }

        if (cropScale > 0) {
          const plantSpacing = field.phase === 'ready' ? 0.46 : field.phase === 'growing' ? 0.56 : 0.68
          const plantCount = Math.max(1, Math.floor(segmentLength / plantSpacing))
          for (let plant = 0; plant < plantCount; plant++) {
            const fraction = (plant + 0.5) / plantCount
            const seed = field.id * 31.17 + row * 7.13 + plant * 2.39
            const along = t0 + segmentLength * fraction + Math.sin(seed * 1.7) * 0.08
            const across = n + rowJitter + Math.cos(seed * 1.13) * 0.035
            const px = tx * along + nx * across
            const pz = tz * along + nz * across
            const variation = 0.78 + (Math.sin(seed * 2.03) * 0.5 + 0.5) * 0.34
            const sideJitter = Math.sin(seed * 3.71) * 0.045
            this.instanceFn(
              'fieldCrop',
              px + nx * sideJitter,
              0.06 + cropScale * variation * 0.2,
              pz + nz * sideJitter,
              variation * 0.82,
              cropScale * variation,
              variation * 0.82,
              cropColor,
              seed,
            )
          }
        }
      }

      let rowIndex = 0
      for (let n = minN + rowSpacing * 0.7; n <= maxN - rowSpacing * 0.55; n += rowSpacing) {
        let start: number | null = null
        let lastInside = minT
        for (let t = minT; t <= maxT + sampleStep * 0.5; t += sampleStep) {
          const cappedT = Math.min(t, maxT)
          const point = { x: tx * cappedT + nx * n, z: tz * cappedT + nz * n }
          const inside = t <= maxT && pointInPolygon(point, field.points)
          if (inside) {
            if (start === null) start = cappedT
            lastInside = cappedT
          } else if (start !== null) {
            emitRow(start, Math.min(maxT, lastInside + sampleStep * 0.55), n, rowIndex)
            start = null
          }
        }
        if (start !== null) emitRow(start, maxT, n, rowIndex)
        rowIndex++
      }

      // Keep parcel edges soft: sparse grass strips and hedge-like clumps instead
      // of one continuous dark frame around every field.
      for (let i = 0; i < field.points.length; i++) {
        const a = field.points[i]
        const b = field.points[(i + 1) % field.points.length]
        const dx = b.x - a.x
        const dz = b.z - a.z
        const segmentLength = Math.max(0.05, Math.hypot(dx, dz))
        const rotation = Math.atan2(-dz, dx)
        const stripCount = Math.max(1, Math.ceil(segmentLength / 4.4))
        for (let strip = 0; strip < stripCount; strip++) {
          const startT = strip / stripCount
          const endT = Math.min(1, startT + 0.62 / stripCount)
          const midT = (startT + endT) / 2
          const stripLength = segmentLength * (endT - startT)
          if (stripLength < 0.25) continue
          this.instanceFn(
            'fieldEdgeGrass',
            a.x + dx * midT,
            0.043,
            a.z + dz * midT,
            stripLength,
            1,
            1,
            (i + strip) % 3 === 0 ? 0x748653 : 0x697b4d,
            rotation,
          )
        }

        const clumps = Math.max(1, Math.floor(segmentLength / 2.8))
        for (let j = 0; j < clumps; j++) {
          const t = (j + 0.5) / clumps
          const seed = field.id * 17.13 + i * 5.17 + j * 2.31
          const jitter = Math.sin(seed) * 0.11
          const x = a.x + dx * t + (-dz / segmentLength) * jitter
          const z = a.z + dz * t + (dx / segmentLength) * jitter
          this.instanceFn(
            'underbrush',
            x,
            0.11,
            z,
            0.24 + (Math.sin(seed * 1.9) * 0.5 + 0.5) * 0.24,
            0.24,
            0.24 + (Math.cos(seed * 1.3) * 0.5 + 0.5) * 0.22,
            j % 2 === 0 ? 0x68804e : 0x758956,
            seed,
          )
        }
      }
    }
  }


  updateSelection(field: FieldPlot | undefined, time: number): void {
    this.selection.visible = !!field
    if (!field) return
    const positions = new Float32Array(field.points.length * 3)
    field.points.forEach((point, index) => {
      positions[index * 3] = point.x
      positions[index * 3 + 1] = 0.115
      positions[index * 3 + 2] = point.z
    })
    this.selection.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    this.selection.geometry.computeBoundingSphere()
    this.selection.material.opacity = 0.72 + Math.sin(time * 3) * 0.08
  }
}
