import * as THREE from 'three'
import { BUILDINGS, type BuildingId } from '../data/buildings'
import { RESOURCES } from '../data/resources'
import { phaseForTime } from '../simulation/DayNight'
import { MAP_SIZE } from '../simulation/Navigation'
import type { Building, Point, WorldState } from '../simulation/WorldState'
import {
  constructionProgress,
  constructionVisualStage,
  damageVisualState,
  nightAmount,
} from './BuildingPresentation'

export type CameraMode = 'settlement' | 'follow'

interface BatchOptions {
  roughness?: number
  metalness?: number
  emissive?: number
  emissiveIntensity?: number
  opacity?: number
  depthWrite?: boolean
}

function createGableRoofGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.5, 0, -0.5, 0.5, 0, -0.5, 0, 1, -0.5,
    -0.5, 0, 0.5, 0.5, 0, 0.5, 0, 1, 0.5,
  ], 3))
  geometry.setIndex([
    0, 1, 2,
    3, 5, 4,
    0, 2, 5, 0, 5, 3,
    2, 1, 4, 2, 4, 5,
    0, 3, 4, 0, 4, 1,
  ])
  geometry.computeVertexNormals()
  return geometry
}

function shade(color: number, amount: number): number {
  return new THREE.Color(color).multiplyScalar(amount).getHex()
}

export class SceneRenderer {
  readonly canvas = document.createElement('canvas')
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 180)
  readonly focus = { x: 0, z: -1 }

  mode: CameraMode = 'settlement'
  zoom = 36
  angle = 0
  debug = false

  private readonly renderer: THREE.WebGLRenderer
  private readonly sun = new THREE.DirectionalLight(0xffe1b0, 2.4)
  private readonly moon = new THREE.DirectionalLight(0x9db9ff, 0)
  private readonly ambient = new THREE.HemisphereLight(0xb8c7ff, 0x30281f, 1.25)
  private readonly settlementFill = new THREE.PointLight(0xffa55f, 0, 34, 1.7)
  private readonly glowLights: THREE.PointLight[] = []
  private lightCursor = 0

  private readonly matrix = new THREE.Object3D()
  private readonly batches: Record<string, THREE.InstancedMesh> = {}
  private readonly batchColors: Record<string, number> = {}
  private readonly geometry = new THREE.BoxGeometry(1, 1, 1)
  private readonly groundMaterial = new THREE.MeshStandardMaterial({ color: 0x556744, roughness: 1 })
  private readonly grid: THREE.GridHelper
  private readonly ghost: THREE.Mesh
  private readonly ghostFootprint: THREE.Mesh
  private readonly ghostLine: THREE.InstancedMesh
  private readonly facing: THREE.Mesh
  private readonly selection: THREE.Mesh
  private readonly selectionFill: THREE.Mesh
  private readonly paths: THREE.LineSegments
  private readonly ray = new THREE.Raycaster()
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  private readonly dayColor = new THREE.Color(0xa7bdd0)
  private readonly duskColor = new THREE.Color(0x5a5361)
  private readonly nightColor = new THREE.Color(0x0c1324)

  constructor() {
    this.canvas.className = 'game-canvas'
    this.canvas.tabIndex = 0
    this.canvas.setAttribute('aria-label', 'Settlement world. Click to inspect or place a building.')

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05

    this.scene.background = new THREE.Color()
    this.scene.fog = new THREE.Fog(0xa7bdd0, 58, 128)

    this.sun.position.set(-20, 40, 20)
    this.sun.castShadow = true
    Object.assign(this.sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, far: 100 })
    this.sun.shadow.mapSize.set(1024, 1024)
    this.sun.shadow.normalBias = 0.03

    this.moon.position.set(24, 34, -28)
    this.moon.castShadow = false
    this.settlementFill.position.set(0, 9, 0)
    this.scene.add(this.sun, this.moon, this.ambient, this.settlementFill)

    for (let i = 0; i < 10; i++) {
      const light = new THREE.PointLight(0xffa04f, 0, 8, 2)
      light.visible = false
      this.glowLights.push(light)
      this.scene.add(light)
    }

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE), this.groundMaterial)
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    this.scene.add(ground)

    this.grid = new THREE.GridHelper(46, 46, 0x819077, 0x65725c)
    this.grid.position.y = 0.012
    const gridMaterials = Array.isArray(this.grid.material) ? this.grid.material : [this.grid.material]
    for (const material of gridMaterials) {
      material.transparent = true
      material.opacity = 0.3
    }
    this.scene.add(this.grid)

    this.addBatch('wood', new THREE.ConeGeometry(0.7, 2.15, 7), 0x2f4a34, 1000)
    this.addBatch('treeTrunks', new THREE.CylinderGeometry(0.16, 0.22, 1.4, 6), 0x5a4030, 1000)
    this.addBatch('food', new THREE.DodecahedronGeometry(0.62, 0), 0x809c55, 1000)
    this.addBatch('settlers', new THREE.CapsuleGeometry(0.22, 0.45, 3, 5), 0xe6ce9c, 10)
    this.addBatch('guards', new THREE.CapsuleGeometry(0.24, 0.5, 3, 5), 0xa96f52, 10)
    this.addBatch('enemies', new THREE.CapsuleGeometry(0.26, 0.5, 3, 5), 0x6f2525, 64)
    this.addBatch('cargo', this.geometry, 0xffffff, 10)
    this.addBatch('buildings', this.geometry, 0xffffff, 256)
    this.addBatch('fortifications', this.geometry, 0xffffff, 512)
    this.addBatch('timber', this.geometry, 0x5b3d2b, 1600)
    this.addBatch('foundation', this.geometry, 0x655f55, 256)
    this.addBatch('scaffold', this.geometry, 0xb58a56, 900)
    this.addBatch('roofs', createGableRoofGeometry(), 0x4a342e, 180, { roughness: 1 })
    this.addBatch('doors', this.geometry, 0x4e3426, 256)
    this.addBatch('windows', this.geometry, 0xe6b56b, 512, {
      roughness: 0.6, emissive: 0xff9d45, emissiveIntensity: 1.2,
    })
    this.addBatch('crates', this.geometry, 0x7c5b3b, 640)
    this.addBatch('barrels', new THREE.CylinderGeometry(0.34, 0.34, 0.72, 10), 0x765034, 512)
    this.addBatch('stones', new THREE.DodecahedronGeometry(0.22, 0), 0x756f65, 512)
    this.addBatch('grass', new THREE.ConeGeometry(0.14, 0.42, 4), 0x465b35, 512)
    this.addBatch('debris', new THREE.DodecahedronGeometry(0.28, 0), 0x55483d, 640)
    this.addBatch('smoke', new THREE.SphereGeometry(0.35, 7, 5), 0x77777a, 256, {
      roughness: 1, opacity: 0.42, depthWrite: false,
    })
    this.addBatch('groundPatch', new THREE.CylinderGeometry(1, 1, 0.025, 12), 0x625943, 512, { roughness: 1 })
    this.addBatch('campfireFire', new THREE.ConeGeometry(0.28, 0.7, 7), 0xf39a42, 120, {
      roughness: 0.45, emissive: 0xff5a18, emissiveIntensity: 1.8,
    })
    this.addBatch('progress', this.geometry, 0xe4bc6b, 120, {
      roughness: 0.6, emissive: 0x6f4a20, emissiveIntensity: 0.5,
    })
    this.addBatch('player', new THREE.CapsuleGeometry(0.3, 0.65, 4, 6), 0x73d9dd, 1)
    this.addBatch('healthBack', this.geometry, 0x2b211f, 256, { roughness: 1 })
    this.addBatch('healthFill', this.geometry, 0x76b56e, 256, { roughness: 0.8 })

    this.ghost = new THREE.Mesh(
      this.geometry,
      new THREE.MeshBasicMaterial({ color: 0x82d6a4, transparent: true, opacity: 0.28, depthWrite: false }),
    )
    this.ghost.visible = false
    this.scene.add(this.ghost)

    this.ghostFootprint = new THREE.Mesh(
      this.geometry,
      new THREE.MeshBasicMaterial({ color: 0x82d6a4, transparent: true, opacity: 0.22, depthWrite: false }),
    )
    this.ghostFootprint.visible = false
    this.scene.add(this.ghostFootprint)

    this.ghostLine = new THREE.InstancedMesh(
      this.geometry,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.34, depthWrite: false, vertexColors: true }),
      120,
    )
    this.ghostLine.count = 0
    this.ghostLine.visible = false
    this.ghostLine.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.ghostLine.frustumCulled = false
    this.scene.add(this.ghostLine)

    this.facing = new THREE.Mesh(
      this.geometry,
      new THREE.MeshBasicMaterial({ color: 0xffcf69, transparent: true, opacity: 0.95, depthWrite: false }),
    )
    this.facing.visible = false
    this.scene.add(this.facing)

    this.selectionFill = new THREE.Mesh(
      this.geometry,
      new THREE.MeshBasicMaterial({ color: 0xffd78b, transparent: true, opacity: 0.12, depthWrite: false }),
    )
    this.selectionFill.visible = false
    this.scene.add(this.selectionFill)

    this.selection = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 0.73, 40),
      new THREE.MeshBasicMaterial({ color: 0xffe0a1, side: THREE.DoubleSide, transparent: true, opacity: 0.95 }),
    )
    this.selection.rotation.x = -Math.PI / 2
    this.selection.visible = false
    this.scene.add(this.selection)

    this.paths = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x7ff0e4, transparent: true, opacity: 0.8 }),
    )
    this.paths.frustumCulled = false
    this.scene.add(this.paths)
  }

  private addBatch(
    name: string,
    geometry: THREE.BufferGeometry,
    color: number,
    count: number,
    options: BatchOptions = {},
  ): void {
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: options.roughness ?? 0.9,
      metalness: options.metalness ?? 0,
      emissive: options.emissive ?? 0x000000,
      emissiveIntensity: options.emissiveIntensity ?? 0,
      transparent: (options.opacity ?? 1) < 1,
      opacity: options.opacity ?? 1,
      depthWrite: options.depthWrite ?? true,
    })
    const mesh = new THREE.InstancedMesh(geometry, material, count)
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.count = 0
    mesh.castShadow = !name.startsWith('health') && name !== 'smoke' && name !== 'groundPatch'
    mesh.receiveShadow = !name.startsWith('health') && name !== 'smoke'
    mesh.frustumCulled = false
    this.batchColors[name] = color
    this.batches[name] = mesh
    this.scene.add(mesh)
  }

  private instance(
    name: string,
    x: number,
    y: number,
    z: number,
    sx = 1,
    sy = 1,
    sz = 1,
    color?: number,
    rotation = 0,
  ): void {
    const mesh = this.batches[name]
    const i = mesh.count++
    this.matrix.position.set(x, y, z)
    this.matrix.scale.set(sx, sy, sz)
    this.matrix.rotation.set(0, rotation, 0)
    this.matrix.updateMatrix()
    mesh.setMatrixAt(i, this.matrix.matrix)
    mesh.setColorAt(i, new THREE.Color(color ?? this.batchColors[name]))
  }

  private localInstance(
    name: string,
    building: Building,
    rotation: number,
    localX: number,
    y: number,
    localZ: number,
    sx: number,
    sy: number,
    sz: number,
    color?: number,
    localRotation = 0,
  ): void {
    const sin = Math.sin(rotation)
    const cos = Math.cos(rotation)
    const x = building.x + localX * cos + localZ * sin
    const z = building.z - localX * sin + localZ * cos
    this.instance(name, x, y, z, sx, sy, sz, color, rotation + localRotation)
  }

  private useGlowLight(
    x: number,
    y: number,
    z: number,
    intensity: number,
    color = 0xffa04f,
    distance = 8,
  ): void {
    if (this.lightCursor >= this.glowLights.length || intensity <= 0.01) return
    const light = this.glowLights[this.lightCursor++]
    light.visible = true
    light.position.set(x, y, z)
    light.color.setHex(color)
    light.intensity = intensity
    light.distance = distance
  }

  private recentlyHit(lastHitTick: number, tick: number): boolean {
    return lastHitTick > 0 && tick - lastHitTick <= 4
  }

  private healthBar(x: number, y: number, z: number, health: number, maxHealth: number, width = 1): void {
    if (maxHealth <= 0 || health >= maxHealth) return
    const ratio = THREE.MathUtils.clamp(health / maxHealth, 0, 1)
    this.instance('healthBack', x, y, z, width, 0.08, 0.12)
    if (ratio > 0) {
      this.instance(
        'healthFill',
        x - width * (1 - ratio) / 2,
        y + 0.01,
        z,
        Math.max(0.02, width * ratio),
        0.09,
        0.13,
        ratio > 0.5 ? 0x76b56e : ratio > 0.25 ? 0xd2a34d : 0xc85a50,
      )
    }
  }

  private renderTerrain(state: WorldState): void {
    for (let i = 0; i < 34; i++) {
      const angle = i * 2.3999632297
      const radius = 5 + (i * 7 % 19)
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      const sx = 1.6 + (i % 4) * 0.45
      const sz = 1.2 + ((i * 3) % 5) * 0.35
      this.instance('groundPatch', x, 0.022, z, sx, 1, sz, i % 3 === 0 ? 0x5d533e : 0x4f6040, angle)
    }

    for (const building of state.buildings) {
      if (building.destroyed) continue
      const footprint = BUILDINGS[building.type].footprint
      const scale = building.type === 'campfire' ? 0.9 : Math.max(0.9, footprint * 0.65)
      this.instance('groundPatch', building.x, 0.028, building.z, scale, 1, scale * 0.88, 0x6b5b42, building.id * 0.71)
    }
  }

  private renderNodeDressing(state: WorldState): void {
    for (const n of state.nodes) {
      if (n.remaining <= 0) continue
      if (n.resource === 'wood') {
        this.instance('treeTrunks', n.x, 0.7, n.z, 1, 1, 1)
        this.instance('wood', n.x, 1.9, n.z, 1, 1, 1, undefined, n.id * 0.37)
        if (n.id % 2 === 0) this.instance('wood', n.x + 0.2, 2.6, n.z - 0.12, 0.68, 0.72, 0.68, 0x3a5739, n.id)
      } else {
        this.instance('food', n.x, 0.48, n.z, 1, 0.82, 1, undefined, n.id)
        this.instance('food', n.x + 0.38, 0.35, n.z + 0.16, 0.52, 0.52, 0.52, 0x9bac61)
        this.instance('food', n.x - 0.32, 0.32, n.z - 0.18, 0.46, 0.46, 0.46, 0x6e8c48)
      }
    }
  }

  private renderConstruction(building: Building, state: WorldState): void {
    const def = BUILDINGS[building.type]
    const rotation = building.rotation * Math.PI / 2
    const progress = constructionProgress(building, def)
    const stage = constructionVisualStage(building, def)

    if (building.type === 'campfire') {
      const count = stage === 'frame' ? 8 : 4
      for (let i = 0; i < count; i++) {
        const angle = i / 8 * Math.PI * 2
        this.instance('stones', building.x + Math.sin(angle) * 0.48, 0.15, building.z + Math.cos(angle) * 0.48, 0.8, 0.55, 0.8)
      }
      if (stage === 'frame') {
        this.instance('timber', building.x, 0.2, building.z, 0.78, 0.16, 0.16, 0x6c482d, Math.PI / 4)
        this.instance('timber', building.x, 0.21, building.z, 0.78, 0.16, 0.16, 0x6c482d, -Math.PI / 4)
      }
    } else if (def.fortification) {
      this.instance('foundation', building.x, 0.08, building.z, 0.92, 0.16, 0.82, 0x676058, rotation)
      const frameHeight = stage === 'frame' ? 0.6 + progress * 0.9 : 0.35
      this.localInstance('scaffold', building, rotation, -0.36, frameHeight / 2, 0, 0.12, frameHeight, 0.12)
      this.localInstance('scaffold', building, rotation, 0.36, frameHeight / 2, 0, 0.12, frameHeight, 0.12)
      if (stage === 'frame') {
        this.localInstance('timber', building, rotation, 0, Math.max(0.35, frameHeight * 0.55), 0, 0.72, 0.14, 0.16, 0x765237)
      }
    } else {
      const half = def.footprint * 0.43
      this.instance('foundation', building.x, 0.09, building.z, def.footprint * 0.9, 0.18, def.footprint * 0.9, 0x69635b, rotation)
      for (const [lx, lz] of [[-half, -half], [half, -half], [-half, half], [half, half]]) {
        this.localInstance('scaffold', building, rotation, lx, stage === 'frame' ? 0.8 : 0.25, lz, 0.12, stage === 'frame' ? 1.6 : 0.5, 0.12)
      }
      if (stage === 'frame') {
        const frameY = 1.5
        this.localInstance('timber', building, rotation, 0, frameY, -half, def.footprint * 0.82, 0.14, 0.14, 0x6b4930)
        this.localInstance('timber', building, rotation, 0, frameY, half, def.footprint * 0.82, 0.14, 0.14, 0x6b4930)
        this.localInstance('timber', building, rotation, -half, frameY, 0, 0.14, 0.14, def.footprint * 0.82, 0x6b4930)
        this.localInstance('timber', building, rotation, half, frameY, 0, 0.14, 0.14, def.footprint * 0.82, 0x6b4930)
        const partialHeight = 0.35 + progress * 0.9
        this.instance('buildings', building.x, partialHeight / 2, building.z, 2.55, partialHeight, 2.55, 0x8a8174, rotation)
      }
    }

    const y = def.fortification ? 1.7 : building.type === 'campfire' ? 1.1 : 3.35
    const width = def.fortification ? 0.95 : building.type === 'campfire' ? 1.1 : 2.7
    this.instance('progress', building.x - width / 2 + progress * width / 2, y, building.z, Math.max(0.05, progress * width), 0.12, 0.18)

    if (stage === 'foundation' && state.elapsedSeconds % 2 < 1) {
      this.instance('progress', building.x, y + 0.22, building.z, 0.12, 0.12, 0.12, 0xffd889)
    }
  }

  private renderHouse(building: Building, rotation: number, tint: number, night: number): void {
    this.instance('buildings', building.x, 1.08, building.z, 2.65, 2.16, 2.65, tint, rotation)
    const beam = shade(tint, 0.52)
    for (const lx of [-1.18, 1.18]) {
      for (const lz of [-1.18, 1.18]) this.localInstance('timber', building, rotation, lx, 1.13, lz, 0.13, 2.3, 0.13, beam)
    }
    this.localInstance('timber', building, rotation, 0, 1.58, 1.27, 2.42, 0.12, 0.12, beam)
    this.localInstance('timber', building, rotation, 0, 1.58, -1.27, 2.42, 0.12, 0.12, beam)
    this.instance('roofs', building.x, 2.05, building.z, 3.15, 1.25, 3.05, 0x4c342f, rotation)
    this.localInstance('doors', building, rotation, 0, 0.76, 1.35, 0.72, 1.5, 0.14, 0x563625)
    const windowColor = night > 0.05 ? 0xffc56b : 0x806c55
    this.localInstance('windows', building, rotation, -0.72, 1.25, 1.37, 0.46, 0.5, 0.08, windowColor)
    this.localInstance('windows', building, rotation, 0.72, 1.25, 1.37, 0.46, 0.5, 0.08, windowColor)
    this.localInstance('fortifications', building, rotation, 0.76, 2.85, -0.25, 0.34, 1.45, 0.34, 0x51433b)
    for (const [lx, lz] of [[-1.65, 1.55], [1.7, -1.4], [-1.65, -1.3]]) {
      this.localInstance('grass', building, rotation, lx, 0.22, lz, 1, 1, 1)
    }
    if (night > 0.45) this.useGlowLight(building.x, 1.9, building.z, 0.42 * night, 0xffb25f, 5.2)
  }

  private renderStockpile(building: Building, rotation: number): void {
    this.instance('foundation', building.x, 0.14, building.z, 2.72, 0.28, 2.72, 0x65533d, rotation)
    for (const lx of [-1.12, 1.12]) {
      for (const lz of [-1.12, 1.12]) this.localInstance('timber', building, rotation, lx, 0.72, lz, 0.12, 1.45, 0.12, 0x5a3c29)
    }
    this.instance('roofs', building.x, 1.38, building.z, 2.8, 0.58, 2.65, 0x514039, rotation)
    const total = building.inventory.wood + building.inventory.food + building.inventory.ale
    const stacks = Math.min(7, 2 + Math.floor(total / 60))
    const offsets = [[-0.72,-0.5],[0.1,-0.55],[0.72,-0.42],[-0.62,0.32],[0.18,0.25],[0.72,0.38],[0,0.72]]
    for (let i = 0; i < stacks; i++) {
      const [lx, lz] = offsets[i]
      if (i % 3 === 2) this.localInstance('barrels', building, rotation, lx, 0.46, lz, 1, 1, 1, 0x745035)
      else this.localInstance('crates', building, rotation, lx, 0.38, lz, 0.62, 0.62, 0.62, i % 2 ? 0x8b633d : 0x725137)
    }
  }

  private renderGuardPost(building: Building, rotation: number, tint: number, night: number): void {
    this.instance('foundation', building.x, 0.2, building.z, 2.5, 0.4, 2.5, 0x68635c, rotation)
    this.instance('buildings', building.x, 0.95, building.z, 2.05, 1.5, 2.05, tint, rotation)
    for (const lx of [-0.95, 0.95]) {
      for (const lz of [-0.95, 0.95]) this.localInstance('timber', building, rotation, lx, 1.35, lz, 0.14, 2.7, 0.14, 0x533827)
    }
    this.instance('roofs', building.x, 2.12, building.z, 2.55, 0.78, 2.45, 0x413533, rotation)
    this.localInstance('doors', building, rotation, 0, 0.7, 1.08, 0.66, 1.35, 0.12, 0x4b3124)
    for (const lx of [-0.72, 0.72]) this.localInstance('fortifications', building, rotation, lx, 2.15, 1.08, 0.3, 0.45, 0.26, 0x60442f)
    this.localInstance('timber', building, rotation, 0, 2.72, -0.4, 0.1, 1.1, 0.1, 0x4c3325)
    this.localInstance('windows', building, rotation, 0, 1.35, 1.06, 0.5, 0.28, 0.08, night > 0.05 ? 0xe7a85c : 0x75644f)
  }

  private renderTavern(building: Building, rotation: number, tint: number, state: WorldState, night: number): void {
    const active = (phaseForTime(state.timeOfDay) === 'dusk' || phaseForTime(state.timeOfDay) === 'dawn') && building.inventory.ale > 0
    this.instance('buildings', building.x, 1.12, building.z, 2.85, 2.24, 2.85, tint, rotation)
    const beam = shade(tint, 0.5)
    for (const lx of [-1.28, 1.28]) {
      for (const lz of [-1.28, 1.28]) this.localInstance('timber', building, rotation, lx, 1.15, lz, 0.14, 2.35, 0.14, beam)
    }
    this.instance('roofs', building.x, 2.12, building.z, 3.35, 1.28, 3.15, 0x56362f, rotation)
    this.localInstance('doors', building, rotation, 0, 0.78, 1.46, 0.78, 1.55, 0.15, 0x513020)
    const windowColor = active || night > 0.3 ? 0xffc162 : 0x8f704e
    for (const lx of [-0.85, 0.85]) this.localInstance('windows', building, rotation, lx, 1.35, 1.48, 0.52, 0.56, 0.08, windowColor)
    this.localInstance('timber', building, rotation, 1.45, 1.86, 1.32, 0.12, 1.05, 0.12, 0x543826)
    this.localInstance('crates', building, rotation, 1.48, 1.93, 1.47, 0.7, 0.48, 0.12, 0xc19a5d)
    this.localInstance('barrels', building, rotation, -1.58, 0.4, 0.76, 0.8, 1, 0.8, 0x7a5032)
    this.localInstance('barrels', building, rotation, -1.62, 0.4, 0.02, 0.8, 1, 0.8, 0x68452f)
    this.localInstance('fortifications', building, rotation, -0.92, 2.95, -0.42, 0.32, 1.5, 0.32, 0x51433b)
    if (active || night > 0.45) {
      const flicker = 0.9 + Math.sin(state.elapsedSeconds * 5.6 + building.id) * 0.08
      this.useGlowLight(building.x, 2, building.z + 0.2, (active ? 1.35 : 0.75) * flicker * Math.max(0.45, night), 0xffa24d, 9)
    }
  }

  private renderBrewery(building: Building, rotation: number, tint: number, state: WorldState, night: number): void {
    const production = BUILDINGS.brewery.production!
    const active = phaseForTime(state.timeOfDay) === 'day'
      && building.inventory[production.inputResource] >= production.inputAmount
      && building.inventory[production.outputResource] + production.outputAmount <= production.outputCapacity
    this.instance('buildings', building.x, 1.02, building.z, 2.75, 2.04, 2.75, tint, rotation)
    this.instance('roofs', building.x, 1.95, building.z, 3.15, 1.08, 3.0, 0x4f3830, rotation)
    this.localInstance('doors', building, rotation, -0.65, 0.72, 1.4, 0.66, 1.42, 0.14, 0x4c3023)
    this.localInstance('windows', building, rotation, 0.62, 1.3, 1.42, 0.58, 0.5, 0.08, active || night > 0.35 ? 0xf1ad5d : 0x81694e)
    this.localInstance('fortifications', building, rotation, 0.92, 2.75, -0.72, 0.4, 2.05, 0.4, 0x4b4038)
    this.localInstance('barrels', building, rotation, -1.58, 0.44, -0.52, 0.9, 1.1, 0.9, 0x734d31)
    this.localInstance('barrels', building, rotation, -1.55, 0.44, 0.3, 0.9, 1.1, 0.9, 0x805536)
    this.localInstance('crates', building, rotation, 1.58, 0.35, 0.68, 0.56, 0.56, 0.56, 0x765237)

    if (active || building.productionProgress > 0) {
      const base = (state.elapsedSeconds * 0.34 + building.id * 0.17) % 1
      for (let i = 0; i < 3; i++) {
        const t = (base + i / 3) % 1
        const sin = Math.sin(rotation)
        const cos = Math.cos(rotation)
        const x = building.x + 0.92 * cos - 0.72 * sin + Math.sin(t * 5 + building.id) * 0.08
        const z = building.z - 0.92 * sin - 0.72 * cos
        this.instance('smoke', x, 3.65 + t * 1.8, z, 0.55 + t * 0.45, 0.55 + t * 0.45, 0.55 + t * 0.45, 0x6c6d72)
      }
    }
    if (night > 0.4) this.useGlowLight(building.x, 1.8, building.z, 0.55 * night, 0xff9d4e, 6)
  }

  private renderCampfire(building: Building, state: WorldState, night: number): void {
    for (let i = 0; i < 8; i++) {
      const angle = i / 8 * Math.PI * 2
      this.instance('stones', building.x + Math.sin(angle) * 0.48, 0.15, building.z + Math.cos(angle) * 0.48, 0.8, 0.55, 0.8)
    }
    this.instance('timber', building.x, 0.2, building.z, 0.82, 0.16, 0.16, 0x6d472c, Math.PI / 4)
    this.instance('timber', building.x, 0.21, building.z, 0.82, 0.16, 0.16, 0x6d472c, -Math.PI / 4)
    const flicker = 0.92 + Math.sin(state.elapsedSeconds * 9.2 + building.id * 1.3) * 0.15
    this.instance('campfireFire', building.x, 0.48, building.z, flicker, flicker, flicker, 0xffa347)
    this.instance('campfireFire', building.x + 0.06, 0.56, building.z - 0.04, 0.55, flicker * 0.78, 0.55, 0xffd16a)
    this.useGlowLight(building.x, 1.15, building.z, (0.75 + night * 1.25) * flicker, 0xff8d3c, 8.5)
  }

  private renderFortification(building: Building, rotation: number, tint: number): void {
    const isGate = building.type === 'wood-gate'
    if (isGate) {
      for (const lx of [-0.42, 0.42]) {
        this.localInstance('timber', building, rotation, lx, 0.95, 0, 0.16, 1.9, 0.2, shade(tint, 0.8))
      }
      this.localInstance('timber', building, rotation, 0, 1.72, 0, 1.12, 0.2, 0.22, shade(tint, 0.72))
      this.localInstance('fortifications', building, rotation, -0.2, 0.78, 0, 0.34, 1.45, 0.14, tint)
      this.localInstance('fortifications', building, rotation, 0.2, 0.78, 0, 0.34, 1.45, 0.14, tint)
      this.localInstance('timber', building, rotation, 0, 0.8, 0.02, 0.08, 1.35, 0.08, 0x4f3425)
    } else {
      this.localInstance('fortifications', building, rotation, 0, 0.72, 0, 0.84, 1.18, 0.18, tint)
      for (const lx of [-0.39, 0.39]) {
        this.localInstance('timber', building, rotation, lx, 0.78, 0, 0.13, 1.55, 0.2, shade(tint, 0.72))
      }
      for (const y of [0.45, 0.85, 1.18]) this.localInstance('timber', building, rotation, 0, y, -0.04, 0.76, 0.1, 0.1, shade(tint, 0.84))
    }
  }

  private renderRuin(building: Building, rotation: number): void {
    const def = BUILDINGS[building.type]
    const size = def.fortification ? 0.85 : def.footprint * 0.82
    this.instance('foundation', building.x, 0.08, building.z, size, 0.16, size, 0x504b45, rotation)
    const count = def.fortification ? 3 : 7
    for (let i = 0; i < count; i++) {
      const angle = building.id * 0.9 + i * 2.19
      const radius = def.fortification ? 0.35 : 0.45 + (i % 3) * 0.38
      this.instance(
        'debris',
        building.x + Math.cos(angle) * radius,
        0.16 + (i % 2) * 0.07,
        building.z + Math.sin(angle) * radius,
        0.75 + (i % 3) * 0.22,
        0.5 + (i % 2) * 0.2,
        0.75,
        i % 2 ? 0x4d443c : 0x625243,
        angle,
      )
    }
    if (!def.fortification && building.type !== 'campfire') {
      this.localInstance('timber', building, rotation, -0.9, 0.65, -0.7, 0.16, 1.3, 0.16, 0x473225)
      this.localInstance('timber', building, rotation, 0.75, 0.45, 0.72, 0.16, 0.9, 0.16, 0x473225)
    }
  }

  private renderDamageDressing(building: Building, rotation: number, repairing: boolean): void {
    const damage = damageVisualState(building)
    if (damage === 'healthy') return
    const def = BUILDINGS[building.type]
    const count = damage === 'damaged' ? 2 : damage === 'critical' ? 5 : 7
    const radiusBase = def.fortification ? 0.3 : Math.max(0.45, def.footprint * 0.38)
    for (let i = 0; i < count; i++) {
      const angle = building.id * 1.91 + i * 2.31
      const radius = radiusBase + (i % 2) * 0.25
      this.instance(
        'debris',
        building.x + Math.cos(angle) * radius,
        0.13,
        building.z + Math.sin(angle) * radius,
        0.45,
        0.32,
        0.45,
        damage === 'critical' ? 0x4b4037 : 0x665246,
        angle,
      )
    }
    if (repairing && damage !== 'ruined') {
      const side = def.fortification ? 0.48 : def.footprint * 0.5 + 0.18
      this.localInstance('scaffold', building, rotation, -side, 0.75, 0, 0.1, 1.5, 0.1, 0xc7985b)
      this.localInstance('scaffold', building, rotation, side, 0.75, 0, 0.1, 1.5, 0.1, 0xc7985b)
      this.localInstance('scaffold', building, rotation, 0, 1.1, 0, side * 1.7, 0.1, 0.1, 0xd2a66b)
      this.instance('progress', building.x, 1.45, building.z, 0.28, 0.1, 0.28, 0x9ecb77)
    }
  }

  private renderBuilding(
    building: Building,
    state: WorldState,
    selectedId: number | null,
    night: number,
    repairing: boolean,
  ): void {
    const def = BUILDINGS[building.type]
    const rotation = building.rotation * Math.PI / 2
    const damage = damageVisualState(building)
    const hit = this.recentlyHit(building.lastHitTick, state.tick)

    if (!building.complete) {
      this.renderConstruction(building, state)
      return
    }

    if (damage === 'ruined') {
      this.renderRuin(building, rotation)
    } else {
      const tint = hit
        ? 0xff705e
        : damage === 'critical'
          ? shade(def.color, 0.55)
          : damage === 'damaged'
            ? shade(def.color, 0.76)
            : def.color

      switch (building.type) {
        case 'house':
          this.renderHouse(building, rotation, tint, night)
          break
        case 'stockpile':
          this.renderStockpile(building, rotation)
          break
        case 'guard-post':
          this.renderGuardPost(building, rotation, tint, night)
          break
        case 'tavern':
          this.renderTavern(building, rotation, tint, state, night)
          break
        case 'brewery':
          this.renderBrewery(building, rotation, tint, state, night)
          break
        case 'campfire':
          this.renderCampfire(building, state, night)
          break
        case 'wood-wall':
        case 'wood-gate':
          this.renderFortification(building, rotation, tint)
          break
      }
    }

    this.renderDamageDressing(building, rotation, repairing)

    if (building.health < building.maxHealth || building.id === selectedId) {
      const barY = def.fortification
        ? 2.15
        : building.type === 'house' || building.type === 'tavern' || building.type === 'brewery'
          ? 3.65
          : building.type === 'campfire'
            ? 1.25
            : 2.9
      this.healthBar(building.x, barY, building.z, building.health, building.maxHealth, def.fortification ? 1.1 : 2.3)
    }
  }

  private updateLighting(state: WorldState): void {
    const night = nightAmount(state.timeOfDay)
    const daylight = THREE.MathUtils.clamp(
      Math.sin(state.timeOfDay * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5,
      0.04,
      1,
    )
    const dusk = THREE.MathUtils.clamp(1 - Math.abs(state.timeOfDay * 24 - 19) / 2, 0, 1)

    this.sun.intensity = 0.12 + daylight * 2.35
    this.sun.color.setHex(dusk > 0.05 ? 0xffc07a : 0xffe3b5)
    this.moon.intensity = 0.12 + night * 0.72
    this.ambient.intensity = 0.35 + daylight * 1.05
    this.ambient.color.setHex(night > 0.3 ? 0x7f9bd1 : 0xb8c7ff)
    this.ambient.groundColor.setHex(night > 0.3 ? 0x202735 : 0x30281f)

    const sky = this.scene.background as THREE.Color
    if (dusk > 0.05 && daylight > 0.12) sky.copy(this.nightColor).lerp(this.duskColor, Math.max(daylight, dusk))
    else sky.copy(this.nightColor).lerp(this.dayColor, daylight)

    const fog = this.scene.fog as THREE.Fog
    fog.color.copy(sky).lerp(new THREE.Color(0x1b263c), night * 0.18)
    fog.near = 58 - night * 10
    fog.far = 128 - night * 28

    this.groundMaterial.color.setHex(night > 0.55 ? 0x344037 : night > 0.1 ? 0x46533e : 0x556744)
    const gridMaterials = Array.isArray(this.grid.material) ? this.grid.material : [this.grid.material]
    for (const material of gridMaterials) material.opacity = 0.12 + daylight * 0.18

    const settlement = state.buildings.filter(building => building.complete && !building.destroyed && !BUILDINGS[building.type].fortification)
    if (settlement.length > 0) {
      const center = settlement.reduce((sum, building) => ({ x: sum.x + building.x, z: sum.z + building.z }), { x: 0, z: 0 })
      this.settlementFill.position.set(center.x / settlement.length, 8, center.z / settlement.length)
      this.settlementFill.intensity = night * Math.min(1.4, 0.45 + settlement.length * 0.08)
    } else {
      this.settlementFill.intensity = 0
    }
  }

  sync(state: WorldState, selectedId: number | null): void {
    for (const mesh of Object.values(this.batches)) mesh.count = 0
    this.lightCursor = 0
    for (const light of this.glowLights) light.visible = false

    const night = nightAmount(state.timeOfDay)
    this.renderTerrain(state)
    this.renderNodeDressing(state)

    for (const a of state.settlers) {
      const hit = this.recentlyHit(a.lastHitTick, state.tick)
      const color = hit ? 0xff7868 : a.health <= 0 ? 0x555555 : undefined
      this.instance(a.role === 'guard' ? 'guards' : 'settlers', a.x, 0.55, a.z, 1, 1, 1, color)
      this.healthBar(a.x, 1.25, a.z, a.health, a.maxHealth, 0.8)

      const resource = a.cargo.wood > 0 ? 'wood' : a.cargo.food > 0 ? 'food' : a.cargo.ale > 0 ? 'ale' : null
      if (resource) this.instance('cargo', a.x + 0.28, 0.85, a.z, 0.38, 0.38, 0.38, RESOURCES[resource].color)
    }

    for (const e of state.enemies) {
      const hit = this.recentlyHit(e.lastHitTick, state.tick)
      const color = hit ? 0xff6558 : e.health <= e.maxHealth * 0.5 ? 0x8f3333 : undefined
      this.instance('enemies', e.x, 0.56, e.z, 1, 1, 1, color)
      this.healthBar(e.x, 1.3, e.z, e.health, e.maxHealth, 0.9)
    }

    const playerHit = this.recentlyHit(state.player.lastHitTick, state.tick)
    this.instance(
      'player',
      state.player.x,
      0.7,
      state.player.z,
      1,
      1,
      1,
      playerHit ? 0xff7868 : state.player.health <= 0 ? 0x456064 : undefined,
    )
    this.healthBar(state.player.x, 1.55, state.player.z, state.player.health, state.player.maxHealth, 1.05)

    const repairTargets = new Set(state.jobs.filter(job => job.kind === 'repair').map(job => job.targetId))
    for (const building of state.buildings) {
      this.renderBuilding(building, state, selectedId, night, repairTargets.has(building.id))
    }

    for (let i = this.lightCursor; i < this.glowLights.length; i++) this.glowLights[i].visible = false

    for (const mesh of Object.values(this.batches)) {
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }

    const selected = [...state.settlers, ...state.enemies, ...state.nodes, ...state.buildings].find(entity => entity.id === selectedId)
    this.selection.visible = !!selected
    this.selectionFill.visible = !!selected
    if (selected) {
      const building = state.buildings.find(candidate => candidate.id === selected.id)
      const footprint = building ? BUILDINGS[building.type].footprint : 1
      this.selection.position.set(selected.x, 0.055, selected.z)
      this.selection.scale.setScalar(Math.max(1, footprint * 1.16))
      this.selectionFill.position.set(selected.x, 0.025, selected.z)
      this.selectionFill.scale.set(footprint + 0.12, 0.025, footprint + 0.12)
    }

    this.updateLighting(state)

    if (this.mode === 'follow') {
      this.focus.x = state.player.x
      this.focus.z = state.player.z
    }
    const radius = this.mode === 'follow' ? 9 : this.zoom
    this.camera.position.set(
      this.focus.x + Math.sin(this.angle) * radius * 0.7,
      radius * 0.85,
      this.focus.z + Math.cos(this.angle) * radius * 0.7,
    )
    this.camera.lookAt(this.focus.x, 0, this.focus.z)
    this.camera.updateMatrixWorld()
  }

  updatePaths(state: WorldState): void {
    this.paths.visible = this.debug
    if (!this.debug) return

    const vertices: number[] = []
    for (const agent of [...state.settlers, ...state.enemies]) {
      let prev: Point = agent
      for (const p of agent.path) {
        vertices.push(prev.x, 0.15, prev.z, p.x, 0.15, p.z)
        prev = p
      }
    }

    this.paths.geometry.dispose()
    this.paths.geometry = new THREE.BufferGeometry()
    this.paths.geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  }

  showGhost(
    type: BuildingId | null,
    p: Point | null,
    valid: boolean,
    rotationSteps = 0,
    dragPoints: Point[] = [],
  ): void {
    this.ghost.visible = false
    this.ghostFootprint.visible = false
    this.ghostLine.visible = false
    this.ghostLine.count = 0
    this.facing.visible = false
    if (!type || !p) return

    const def = BUILDINGS[type]
    const rotation = ((rotationSteps % 4) + 4) % 4 * Math.PI / 2
    const height = def.fortification
      ? (type === 'wood-gate' ? 1.8 : 1.35)
      : type === 'house'
        ? 2.2
        : type === 'tavern'
          ? 2.35
          : type === 'brewery'
            ? 2.1
            : type === 'guard-post'
              ? 1.8
              : type === 'campfire'
                ? 0.5
                : 1.1
    const color = new THREE.Color(valid ? 0x82d6a4 : 0xed7474)

    this.ghostFootprint.visible = dragPoints.length <= 1
    if (this.ghostFootprint.visible) {
      this.ghostFootprint.position.set(p.x, 0.035, p.z)
      this.ghostFootprint.rotation.set(0, rotation, 0)
      this.ghostFootprint.scale.set(
        def.fortification ? 0.98 : def.footprint + 0.08,
        0.04,
        def.fortification ? 0.88 : def.footprint + 0.08,
      )
      ;(this.ghostFootprint.material as THREE.MeshBasicMaterial).color.copy(color)
    }

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
      this.ghost.position.set(p.x, height / 2, p.z)
      this.ghost.rotation.set(0, rotation, 0)
      this.ghost.scale.set(
        def.fortification ? 0.92 : def.footprint * 0.9,
        height,
        def.fortification ? 0.82 : def.footprint * 0.9,
      )
      ;(this.ghost.material as THREE.MeshBasicMaterial).color.copy(color)
    }

    if (!def.fortification && type !== 'campfire') {
      const distance = def.footprint / 2 + 0.65
      this.facing.visible = true
      this.facing.position.set(
        p.x + Math.sin(rotation) * distance,
        0.08,
        p.z + Math.cos(rotation) * distance,
      )
      this.facing.rotation.set(0, rotation, 0)
      this.facing.scale.set(0.32, 0.08, 0.82)
    }
  }

  worldPoint(clientX: number, clientY: number): Point | null {
    const rect = this.canvas.getBoundingClientRect()
    this.ray.setFromCamera(
      new THREE.Vector2(
        (clientX - rect.left) / rect.width * 2 - 1,
        -(clientY - rect.top) / rect.height * 2 + 1,
      ),
      this.camera,
    )
    const hit = this.ray.ray.intersectPlane(this.groundPlane, new THREE.Vector3())
    return hit ? { x: Math.round(hit.x), z: Math.round(hit.z) } : null
  }

  resize(width: number, height: number): void {
    this.camera.aspect = Math.max(width, 1) / Math.max(height, 1)
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
  }

  render(): void {
    this.renderer.render(this.scene, this.camera)
  }

  get stats() {
    return { calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles }
  }

  dispose(): void {
    const geometries = new Set<THREE.BufferGeometry>()
    const materials = new Set<THREE.Material>()

    this.scene.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
        geometries.add(object.geometry)
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material)
        if (object instanceof THREE.InstancedMesh) object.dispose()
      }
    })

    geometries.forEach(geometry => geometry.dispose())
    materials.forEach(material => material.dispose())
    this.sun.shadow.dispose()
    this.renderer.dispose()
  }
}
