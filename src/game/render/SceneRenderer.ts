import * as THREE from 'three'
import { BUILDINGS, type BuildingId, type BuildingDefinition } from '../data/buildings'
import { RESOURCE_IDS, RESOURCES } from '../data/resources'
import { MAP_SIZE } from '../simulation/Navigation'
import type { Building, Point, WorldState } from '../simulation/WorldState'
import { atmosphereForTime, constructionVisualStage, damageVisualStage, type DamageVisualStage } from './VisualState'
import { TOWN_PALETTE, visualRoadLinks, visualRoadStrip } from './TownPresentation'

export type CameraMode = 'settlement' | 'follow'

function createGableRoofGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  const vertices = new Float32Array([
    -0.5, 0, -0.5,
     0.5, 0, -0.5,
     0, 0.5, -0.5,
    -0.5, 0,  0.5,
     0.5, 0,  0.5,
     0, 0.5,  0.5,
  ])
  const indices = [
    0, 1, 2,
    5, 4, 3,
    0, 3, 4, 0, 4, 1,
    0, 2, 5, 0, 5, 3,
    1, 4, 5, 1, 5, 2,
  ]
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function createRadialGlowTexture(size = 64): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x + 0.5) / size * 2 - 1
      const ny = (y + 0.5) / size * 2 - 1
      const distance = Math.sqrt(nx * nx + ny * ny)
      const falloff = Math.pow(Math.max(0, 1 - distance), 2.15)
      const offset = (y * size + x) * 4
      const mask = Math.round(falloff * 255)
      data[offset] = mask
      data[offset + 1] = mask
      data[offset + 2] = mask
      data[offset + 3] = 255
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
}

export class SceneRenderer {
  readonly canvas = document.createElement('canvas')
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 180)
  readonly focus = { x: 0, z: -1 }

  mode: CameraMode = 'settlement'
  zoom = 31
  angle = 0
  debug = false
  cinematic = false

  private readonly renderer: THREE.WebGLRenderer
  private readonly sun = new THREE.DirectionalLight(0xfff0cf, 2.4)
  private readonly moon = new THREE.DirectionalLight(0xb7cdff, 0.75)
  private readonly ambient = new THREE.HemisphereLight(0xb8c7ff, 0x3b2d22, 1.25)
  private readonly settlementGlow = new THREE.PointLight(0xffa65b, 0, 36, 1.65)
  private readonly grid = new THREE.GridHelper(46, 46, 0x829077, 0x68755d)
  private readonly groundMaterial = new THREE.MeshStandardMaterial({ color: 0x617248, roughness: 1 })
  private readonly radialGlowTexture = createRadialGlowTexture()
  private readonly matrix = new THREE.Object3D()
  private readonly batches: Record<string, THREE.InstancedMesh> = {}
  private readonly batchColors: Record<string, number> = {}
  private readonly settlementLitBatches = new Set([
    'buildings', 'fortifications', 'campfireFire', 'roofs', 'gableRoofs', 'doors', 'trim', 'props',
    'stone', 'plaster', 'timber', 'metal', 'cloth', 'barrels', 'sacks', 'logs',
    'adultTorso', 'adultSkirt', 'adultHead', 'adultHair', 'guardCoat', 'entertainer',
    'foundation', 'scaffold', 'debris',
  ])
  private readonly geometry = new THREE.BoxGeometry(1, 1, 1)
  private readonly ghost: THREE.Mesh
  private readonly ghostLine: THREE.InstancedMesh
  private readonly facing: THREE.Mesh
  private readonly selection: THREE.LineSegments
  private readonly paths: THREE.LineSegments
  private readonly ray = new THREE.Raycaster()
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  private readonly dayColor = new THREE.Color(0x9eb7c9)
  private readonly nightColor = new THREE.Color(0x16243b)
  private readonly twilightColor = new THREE.Color(0x9f6654)
  private readonly dayGround = new THREE.Color(0x617248)
  private readonly nightGround = new THREE.Color(0x364940)
  private readonly warmGlow = new THREE.Color(0xffc36a)
  private readonly sunDayColor = new THREE.Color(0xffedcf)
  private readonly sunTwilightColor = new THREE.Color(0xffa769)
  private readonly ambientDayColor = new THREE.Color(0xaec2e7)
  private readonly ambientTwilightColor = new THREE.Color(0xffd2a6)
  private readonly ambientGroundNight = new THREE.Color(0x34444d)
  private readonly ambientGroundDay = new THREE.Color(0x4c3e30)
  private readonly fogNightTint = new THREE.Color(0x263a5a)
  private readonly fogDayTint = new THREE.Color(0x52615a)
  private readonly nightSurfaceLift = new THREE.Color(0x566a80)
  private readonly warmPropLift = new THREE.Color(0xb77a43)
  private readonly instanceColor = new THREE.Color()
  private readonly scratchColor = new THREE.Color()

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
    this.renderer.toneMappingExposure = 1.1

    this.scene.background = new THREE.Color()
    this.scene.fog = new THREE.Fog(0x9db5cc, 60, 130)

    this.sun.position.set(-20, 40, 20)
    this.sun.castShadow = true
    Object.assign(this.sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, far: 100 })
    this.sun.shadow.mapSize.set(1024, 1024)
    this.sun.shadow.normalBias = 0.03

    this.moon.position.set(24, 34, -20)
    this.camera.layers.enable(1)
    this.settlementGlow.position.set(0, 2.4, 0)
    this.settlementGlow.decay = 1.45
    this.settlementGlow.layers.set(1)
    this.scene.add(this.sun, this.moon, this.ambient, this.settlementGlow)

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE),
      this.groundMaterial,
    )
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    this.scene.add(ground)

    this.grid.position.y = 0.012
    ;(this.grid.material as THREE.Material).transparent = true
    ;(this.grid.material as THREE.Material).opacity = 0.22
    this.grid.visible = false
    this.scene.add(this.grid)

    this.addBatch('wood', new THREE.ConeGeometry(0.65, 2.8, 6), 0x354d36, 1000)
    this.addBasicBatch('treeMoon', new THREE.ConeGeometry(0.72, 1.35, 6), 0x60758a, 1000, 0.2)
    this.addBatch('food', new THREE.DodecahedronGeometry(0.65, 0), 0x91a95d, 1000)
    this.addBatch('ore', new THREE.DodecahedronGeometry(0.58, 0), 0x737b86, 360)
    this.addBasicBatch('roadBase', new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), TOWN_PALETTE.earth, 320, 0.34)
    this.addBasicBatch('roadWear', new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), TOWN_PALETTE.earthLight, 320, 0.16)
    this.addBasicBatch('yardPatch', new THREE.CircleGeometry(1, 18).rotateX(-Math.PI / 2), 0x66563f, 240, 0.28)
    this.addBatch('stone', this.geometry, TOWN_PALETTE.stone, 1200)
    this.addBatch('plaster', this.geometry, TOWN_PALETTE.plasterWarm, 700)
    this.addBatch('timber', this.geometry, TOWN_PALETTE.timberDark, 2600)
    this.addBatch('metal', this.geometry, TOWN_PALETTE.iron, 520)
    this.addBatch('cloth', this.geometry, TOWN_PALETTE.clothWine, 420)
    this.addBatch('barrels', new THREE.CylinderGeometry(0.5, 0.5, 1, 10), 0x765033, 520)
    this.addBatch('sacks', new THREE.SphereGeometry(0.5, 8, 6), 0x9a865e, 520)
    this.addBatch('logs', new THREE.CylinderGeometry(0.18, 0.22, 1, 8).rotateZ(Math.PI / 2), 0x725037, 700)
    this.addBatch('gableRoofs', createGableRoofGeometry(), TOWN_PALETTE.roofBrown, 360)
    this.addBatch('adultTorso', new THREE.CapsuleGeometry(0.2, 0.34, 3, 6), 0x8b6a51, 80)
    this.addBatch('adultSkirt', new THREE.ConeGeometry(0.32, 0.65, 8), 0x77535a, 80)
    this.addBatch('adultHead', new THREE.SphereGeometry(0.18, 8, 6), 0xd6ad8b, 100)
    this.addBatch('adultHair', new THREE.SphereGeometry(0.19, 8, 6), 0x4a3528, 100)
    this.addBatch('guardCoat', new THREE.CapsuleGeometry(0.23, 0.38, 3, 6), 0x6a5149, 30)
    this.addBatch('entertainer', new THREE.ConeGeometry(0.34, 0.78, 10), TOWN_PALETTE.clothWine, 40)
    this.addBatch('settlers', new THREE.CapsuleGeometry(0.22, 0.45, 3, 5), 0xe6ce9c, 10)
    this.addBatch('guards', new THREE.CapsuleGeometry(0.24, 0.5, 3, 5), 0xa96f52, 10)
    this.addBatch('enemies', new THREE.CapsuleGeometry(0.26, 0.5, 3, 5), 0x6f2525, 64)
    this.addBatch('cargo', this.geometry, 0xffffff, 10)
    this.addBatch('buildings', this.geometry, 0xffffff, 240)
    this.addBatch('fortifications', this.geometry, 0xffffff, 720)
    this.addBatch('campfireFire', new THREE.ConeGeometry(0.28, 0.65, 6), 0xf0a14a, 120)
    this.addBasicBatch('campfireCore', new THREE.ConeGeometry(0.18, 0.5, 6), 0xffd06a, 120, 0.96)
    this.addBatch('roofs', new THREE.ConeGeometry(1, 1, 4), 0x594739, 160)
    this.addBatch('progress', this.geometry, 0xe4bc6b, 120)
    this.addBatch('doors', this.geometry, 0x4f3526, 180)
    this.addBatch('trim', this.geometry, 0x5c402d, 960)
    this.addBatch('props', this.geometry, 0x755337, 720)
    this.addBatch('foundation', this.geometry, 0x716852, 160)
    this.addBatch('scaffold', this.geometry, 0x9b7750, 960)
    this.addBatch('debris', this.geometry, 0x4c4034, 720)
    this.addBasicBatch('groundPatch', new THREE.CircleGeometry(1, 9).rotateX(-Math.PI / 2), 0x596746, 160, 0.12)
    this.addBasicBatch('groundWear', new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2), 0x66583e, 180, 0.16)
    this.addBasicBatch('windowHalo', this.geometry, 0xffb45b, 320, 0.18)
    this.addBasicBatch('windowGlow', this.geometry, 0xffc36a, 320, 0.96)
    this.addRadialBatch('warmPool', 0xffa85a, 240, 0.14)
    this.addRadialBatch('campfirePool', 0xff9a43, 120, 0.44)
    this.addBasicBatch('glow', new THREE.SphereGeometry(0.5, 8, 6), 0xff9b46, 160, 0.15)
    this.addBasicBatch('smoke', new THREE.SphereGeometry(0.45, 7, 5), 0x76787a, 360, 0.26)
    ;(this.batches.windowHalo.material as THREE.MeshBasicMaterial).blending = THREE.AdditiveBlending
    ;(this.batches.glow.material as THREE.MeshBasicMaterial).blending = THREE.AdditiveBlending
    ;(this.batches.campfireCore.material as THREE.MeshBasicMaterial).blending = THREE.AdditiveBlending
    ;(this.batches.treeMoon.material as THREE.MeshBasicMaterial).blending = THREE.AdditiveBlending
    this.addBatch('player', new THREE.CapsuleGeometry(0.3, 0.65, 4, 6), 0x73d9dd, 1)
    this.addBatch('healthBack', this.geometry, 0x2b211f, 256)
    this.addBatch('healthFill', this.geometry, 0x76b56e, 256)

    this.ghost = new THREE.Mesh(
      this.geometry,
      new THREE.MeshBasicMaterial({ color: 0x82d6a4, transparent: true, opacity: 0.38, depthWrite: false }),
    )
    this.ghost.visible = false
    this.scene.add(this.ghost)

    this.ghostLine = new THREE.InstancedMesh(
      this.geometry,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.38, depthWrite: false, vertexColors: true }),
      120,
    )
    this.ghostLine.count = 0
    this.ghostLine.visible = false
    this.ghostLine.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.ghostLine.frustumCulled = false
    this.scene.add(this.ghostLine)

    this.facing = new THREE.Mesh(
      this.geometry,
      new THREE.MeshBasicMaterial({ color: 0xf1c86f, transparent: true, opacity: 0.9, depthWrite: false }),
    )
    this.facing.visible = false
    this.scene.add(this.facing)

    this.selection = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)),
      new THREE.LineBasicMaterial({ color: 0xffd99b, transparent: true, opacity: 0.42 }),
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

  private addBatch(name: string, geometry: THREE.BufferGeometry, color: number, count: number): void {
    const mesh = new THREE.InstancedMesh(
      geometry,
      new THREE.MeshStandardMaterial({ color, roughness: 0.9 }),
      count,
    )
    this.finishBatch(name, mesh, color)
  }

  private addBasicBatch(name: string, geometry: THREE.BufferGeometry, color: number, count: number, opacity = 1): void {
    const mesh = new THREE.InstancedMesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color,
        transparent: opacity < 1,
        opacity,
        depthWrite: opacity >= 1,
      }),
      count,
    )
    this.finishBatch(name, mesh, color)
  }

  private addRadialBatch(name: string, color: number, count: number, opacity: number): void {
    const mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color,
        alphaMap: this.radialGlowTexture,
        transparent: true,
        opacity,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      count,
    )
    this.finishBatch(name, mesh, color)
  }

  private finishBatch(name: string, mesh: THREE.InstancedMesh, color: number): void {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.count = 0
    mesh.castShadow = !name.startsWith('health') && !['treeMoon', 'campfireCore', 'windowHalo', 'windowGlow', 'warmPool', 'campfirePool', 'glow', 'smoke', 'groundPatch', 'groundWear', 'roadBase', 'roadWear', 'yardPatch'].includes(name)
    mesh.receiveShadow = !name.startsWith('health') && !['treeMoon', 'campfireCore', 'windowHalo', 'windowGlow', 'warmPool', 'campfirePool', 'glow', 'smoke', 'groundPatch', 'groundWear', 'roadBase', 'roadWear', 'yardPatch'].includes(name)
    mesh.frustumCulled = false
    if (this.settlementLitBatches.has(name)) mesh.layers.enable(1)
    this.batchColors[name] = color
    this.batches[name] = mesh
    this.scene.add(mesh)
  }

  private instance(
    name: string, x: number, y: number, z: number,
    sx = 1, sy = 1, sz = 1, color?: number, rotation = 0,
  ): void {
    const mesh = this.batches[name]
    const i = mesh.count++
    this.matrix.position.set(x, y, z)
    this.matrix.scale.set(sx, sy, sz)
    this.matrix.rotation.set(0, rotation, 0)
    this.matrix.updateMatrix()
    mesh.setMatrixAt(i, this.matrix.matrix)
    mesh.setColorAt(i, this.instanceColor.setHex(color ?? this.batchColors[name]))
  }

  private rotatedOffset(x: number, z: number, rotation: number): Point {
    return {
      x: x * Math.cos(rotation) + z * Math.sin(rotation),
      z: -x * Math.sin(rotation) + z * Math.cos(rotation),
    }
  }

  private recentlyHit(lastHitTick: number, tick: number): boolean {
    return lastHitTick > 0 && tick - lastHitTick <= 4
  }

  private damagedColor(color: number, stage: DamageVisualStage): number {
    const multiplier = stage === 'worn' ? 0.86 : stage === 'damaged' ? 0.68 : stage === 'critical' ? 0.5 : 1
    return this.scratchColor.setHex(color).multiplyScalar(multiplier).getHex()
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

  private constructionVisual(b: Building, def: BuildingDefinition, rotation: number): void {
    const stage = constructionVisualStage(b.work, def.constructionWork, b.complete)
    const size = def.fortification ? 0.9 : Math.max(1, def.footprint * 0.86)
    this.instance('foundation', b.x, 0.07, b.z, size, 0.14, size, 0x746b57, rotation)
    if (stage === 'foundation') return

    const half = def.fortification ? 0.32 : Math.max(0.35, def.footprint * 0.34)
    const postHeight = stage === 'frame' ? 1.35 : 1.9
    for (const [lx, lz] of [[-half, -half], [half, -half], [-half, half], [half, half]] as const) {
      const o = this.rotatedOffset(lx, lz, rotation)
      this.instance('scaffold', b.x + o.x, postHeight / 2, b.z + o.z, 0.12, postHeight, 0.12, 0x9b7750, rotation)
    }
    this.instance('scaffold', b.x, postHeight, b.z, Math.max(0.7, half * 2.25), 0.12, 0.12, 0xa07a4f, rotation)
    this.instance('scaffold', b.x, postHeight, b.z, 0.12, 0.12, Math.max(0.7, half * 2.25), 0xa07a4f, rotation)

    if (stage === 'shell') {
      const shellHeight = def.fortification ? 0.9 : 1.15
      this.instance(
        def.fortification ? 'fortifications' : 'buildings',
        b.x,
        shellHeight / 2,
        b.z,
        def.fortification ? 0.78 : Math.max(1, def.footprint * 0.68),
        shellHeight,
        def.fortification ? 0.66 : Math.max(1, def.footprint * 0.68),
        0x7b7468,
        rotation,
      )
    }
  }

  private ruinVisual(b: Building, rotation: number): void {
    this.instance('debris', b.x, 0.12, b.z, 1.4, 0.2, 1.2, 0x433b34, rotation + 0.2)
    const offsets = [[-0.75, -0.55], [0.65, -0.35], [-0.35, 0.72], [0.78, 0.65]] as const
    offsets.forEach(([lx, lz], index) => {
      const o = this.rotatedOffset(lx, lz, rotation)
      this.instance(
        'debris',
        b.x + o.x,
        0.18 + index * 0.025,
        b.z + o.z,
        0.55 + (index % 2) * 0.2,
        0.18,
        0.28,
        index % 2 ? 0x584838 : 0x3f3932,
        rotation + index * 0.48,
      )
    })
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
    this.instance('windowHalo', x, y, z, width * 1.75, height * 1.55, 0.085, color, rotation)
    this.instance('windowGlow', x, y, z, width, height, 0.06, color, rotation)
  }

  private warmGroundPool(x: number, z: number, radius: number, strength: number, night: number): void {
    if (night < 0.06 || strength <= 0) return
    const scale = radius * (0.94 + night * 0.06)
    const color = this.scratchColor.copy(this.warmGlow).multiplyScalar(0.66 + Math.min(1, strength) * 0.18).getHex()
    this.instance('warmPool', x, 0.05, z, scale, 1, scale, color)
  }

  private campfireGroundPool(x: number, z: number, radius: number, night: number): void {
    if (night < 0.06) return
    const scale = radius * (0.94 + night * 0.06)
    const color = this.scratchColor.copy(this.warmGlow).multiplyScalar(0.82 + night * 0.18).getHex()
    this.instance('campfirePool', x, 0.052, z, scale, 1, scale, color)
  }

  private readableNightColor(color: number, night: number): number {
    return this.scratchColor.setHex(color).lerp(this.nightSurfaceLift, night * 0.44).getHex()
  }

  private warmPropColor(color: number, night: number, strength = 0.16): number {
    return this.scratchColor.setHex(color).lerp(this.warmPropLift, night * strength).getHex()
  }

  private updateNightMaterialLift(night: number): void {
    const cool = 0x304763
    const forest = 0x28443e
    const strengths: Record<string, number> = {
      buildings: 0.38,
      fortifications: 0.34,
      roofs: 0.46,
      doors: 0.28,
      trim: 0.4,
      props: 0.42,
      foundation: 0.3,
      scaffold: 0.34,
      debris: 0.26,
      wood: 0.24,
      food: 0.16,
    }
    for (const [name, strength] of Object.entries(strengths)) {
      const material = this.batches[name]?.material
      if (!(material instanceof THREE.MeshStandardMaterial)) continue
      material.emissive.setHex(name === 'wood' || name === 'food' ? forest : cool)
      material.emissiveIntensity = night * strength
    }
  }

  private renderStockpile(b: Building, rotation: number, color: number, night: number): void {
    this.instance('buildings', b.x, 0.14, b.z, 2.7, 0.28, 2.7, color, rotation)
    const total = b.inventory.wood + b.inventory.food + b.inventory.ale
    const stacks = Math.min(6, 2 + Math.floor(total / 60))
    for (let i = 0; i < stacks; i++) {
      const lx = -0.82 + (i % 3) * 0.82
      const lz = -0.62 + Math.floor(i / 3) * 1.0
      const o = this.rotatedOffset(lx, lz, rotation)
      const crateColor = i % 2 ? 0x6c4a31 : 0x7f5a39
      this.instance('props', b.x + o.x, 0.35, b.z + o.z, 0.55, 0.55 + (i % 2) * 0.25, 0.55, this.warmPropColor(crateColor, night, 0.1), rotation)
    }
    this.instance('trim', b.x, 0.36, b.z - 1.25, 2.45, 0.16, 0.14, 0x4f3c2c, rotation)
  }

  private renderHouse(b: Building, rotation: number, color: number, night: number): void {
    const front = this.rotatedOffset(0, 1.36, rotation)
    const left = this.rotatedOffset(-0.72, 1.41, rotation)
    const right = this.rotatedOffset(0.72, 1.41, rotation)
    this.instance('buildings', b.x, 1.15, b.z, 2.65, 2.3, 2.65, color, rotation)
    this.instance('roofs', b.x, 2.92, b.z, 2.35, 1.18, 2.35, 0x514037, Math.PI / 4 + rotation)
    this.instance('doors', b.x + front.x, 0.7, b.z + front.z, 0.56, 1.25, 0.12, 0x4d3324, rotation)
    this.instance('trim', b.x, 1.5, b.z, 2.72, 0.12, 0.12, 0x60432f, rotation)
    this.instance('trim', b.x, 0.72, b.z, 0.12, 1.45, 2.72, 0x60432f, rotation)
    this.warmWindow(b.x + left.x, 1.35, b.z + left.z, rotation, night)
    this.warmWindow(b.x + right.x, 1.35, b.z + right.z, rotation, night)
    const chimney = this.rotatedOffset(0.72, -0.46, rotation)
    this.instance('props', b.x + chimney.x, 2.7, b.z + chimney.z, 0.28, 1.1, 0.28, 0x66564d, rotation)
  }

  private renderGuardPost(b: Building, rotation: number, color: number): void {
    this.instance('buildings', b.x, 0.92, b.z, 1.8, 1.45, 1.8, color, rotation)
    this.instance('buildings', b.x, 1.68, b.z, 2.45, 0.18, 2.45, 0x74513a, rotation)
    this.instance('roofs', b.x, 2.28, b.z, 1.85, 0.78, 1.85, 0x453830, Math.PI / 4 + rotation)
    for (const [lx, lz] of [[-1.05, -1.05], [1.05, -1.05], [-1.05, 1.05], [1.05, 1.05]] as const) {
      const o = this.rotatedOffset(lx, lz, rotation)
      this.instance('trim', b.x + o.x, 0.82, b.z + o.z, 0.13, 1.6, 0.13, 0x523925, rotation)
    }
  }

  private renderTavern(b: Building, rotation: number, color: number, night: number): void {
    const front = this.rotatedOffset(0, 1.43, rotation)
    const winLeft = this.rotatedOffset(-0.75, 1.44, rotation)
    const winRight = this.rotatedOffset(0.75, 1.44, rotation)
    const sign = this.rotatedOffset(1.05, 1.58, rotation)
    this.instance('buildings', b.x, 1.04, b.z, 2.8, 2.08, 2.8, color, rotation)
    this.instance('roofs', b.x, 2.76, b.z, 2.38, 1.02, 2.38, 0x604537, Math.PI / 4 + rotation)
    this.instance('doors', b.x + front.x, 0.78, b.z + front.z, 0.64, 1.5, 0.13, 0x4a3022, rotation)
    this.instance('props', b.x + sign.x, 1.7, b.z + sign.z, 0.62, 0.42, 0.12, 0xa77b42, rotation)
    this.warmWindow(b.x + winLeft.x, 1.35, b.z + winLeft.z, rotation, night, 0.42, 0.52)
    this.warmWindow(b.x + winRight.x, 1.35, b.z + winRight.z, rotation, night, 0.42, 0.52)
    const barrel1 = this.rotatedOffset(-1.13, 1.42, rotation)
    const barrel2 = this.rotatedOffset(-1.18, 0.85, rotation)
    this.instance('props', b.x + barrel1.x, 0.35, b.z + barrel1.z, 0.44, 0.7, 0.44, this.warmPropColor(0x765031, night, 0.22), rotation)
    this.instance('props', b.x + barrel2.x, 0.31, b.z + barrel2.z, 0.38, 0.62, 0.38, this.warmPropColor(0x6b472e, night, 0.2), rotation)
  }

  private renderBrewery(
    b: Building,
    rotation: number,
    color: number,
    time: number,
    night: number,
    productionPhaseActive: boolean,
  ): void {
    this.instance('buildings', b.x, 0.95, b.z, 2.72, 1.9, 2.72, color, rotation)
    this.instance('roofs', b.x, 2.52, b.z, 2.18, 0.84, 2.18, 0x554037, Math.PI / 4 + rotation)
    const chimney = this.rotatedOffset(0.86, -0.72, rotation)
    this.instance('props', b.x + chimney.x, 2.52, b.z + chimney.z, 0.38, 1.7, 0.38, 0x534944, rotation)
    const barrel1 = this.rotatedOffset(-1.1, 1.18, rotation)
    const barrel2 = this.rotatedOffset(-0.58, 1.25, rotation)
    this.instance('props', b.x + barrel1.x, 0.38, b.z + barrel1.z, 0.48, 0.76, 0.48, this.warmPropColor(0x775032, night, 0.18), rotation)
    this.instance('props', b.x + barrel2.x, 0.32, b.z + barrel2.z, 0.4, 0.64, 0.4, this.warmPropColor(0x6c482f, night, 0.16), rotation)
    const furnace = this.rotatedOffset(0.7, 1.39, rotation)
    const stocked = b.inventory.food > 0 || b.inventory.ale > 0
    this.warmWindow(
      b.x + furnace.x,
      1.12,
      b.z + furnace.z,
      rotation,
      night * (stocked ? 0.62 : 0.24),
      0.34,
      0.4,
    )

    const production = BUILDINGS.brewery.production!
    const active = productionPhaseActive
      && b.inventory[production.inputResource] >= production.inputAmount
      && b.inventory[production.outputResource] + production.outputAmount <= production.outputCapacity
    const furnaceHeat = active ? Math.max(0.34, night) : stocked ? night * 0.42 : 0
    this.warmGroundPool(b.x, b.z + 0.15, 1.9, active ? 0.55 : 0.28, furnaceHeat)
    if (active) {
      this.instance('glow', b.x + furnace.x, 0.85, b.z + furnace.z, 0.68, 0.34, 0.68, 0xffa04c)
      for (let i = 0; i < 3; i++) {
        const drift = Math.sin(time * 0.85 + b.id * 0.7 + i) * 0.22
        const rise = (time * 0.24 + i * 0.34) % 1
        this.instance(
          'smoke',
          b.x + chimney.x + drift,
          3.35 + rise * 1.9,
          b.z + chimney.z + i * 0.04,
          0.5 + rise * 0.5,
          0.42 + rise * 0.42,
          0.5 + rise * 0.5,
          night > 0.6 ? 0x59606d : 0x85847f,
        )
      }
    }
  }

  private renderBlacksmith(
    b: Building,
    rotation: number,
    color: number,
    time: number,
    night: number,
    productionPhaseActive: boolean,
  ): void {
    this.instance('buildings', b.x, 0.92, b.z, 2.78, 1.84, 2.78, color, rotation)
    this.instance('roofs', b.x, 2.43, b.z, 2.22, 0.82, 2.22, 0x3f4448, Math.PI / 4 + rotation)
    const front = this.rotatedOffset(0, 1.42, rotation)
    this.instance('doors', b.x + front.x, 0.72, b.z + front.z, 0.62, 1.38, 0.14, 0x40352e, rotation)

    const chimney = this.rotatedOffset(0.92, -0.72, rotation)
    this.instance('props', b.x + chimney.x, 2.56, b.z + chimney.z, 0.42, 1.9, 0.42, 0x3f4448, rotation)
    const anvil = this.rotatedOffset(-0.84, 1.18, rotation)
    this.instance('props', b.x + anvil.x, 0.46, b.z + anvil.z, 0.72, 0.28, 0.36, 0x59616b, rotation)
    this.instance('props', b.x + anvil.x, 0.28, b.z + anvil.z, 0.28, 0.56, 0.28, 0x484f58, rotation)

    const orePile = this.rotatedOffset(0.92, 1.05, rotation)
    this.instance('ore', b.x + orePile.x, 0.28, b.z + orePile.z, 0.62, 0.5, 0.62, 0x69727d, rotation)

    const forge = this.rotatedOffset(0.52, 1.4, rotation)
    const production = BUILDINGS.blacksmith.production!
    const active = productionPhaseActive
      && b.inventory[production.inputResource] >= production.inputAmount
      && b.inventory[production.outputResource] + production.outputAmount <= production.outputCapacity
    const stocked = b.inventory.ore > 0 || b.inventory.tools > 0
    this.warmWindow(
      b.x + forge.x,
      1.05,
      b.z + forge.z,
      rotation,
      active ? 0.9 : night * (stocked ? 0.25 : 0.08),
      0.38,
      0.42,
    )

    if (active) {
      const pulse = 0.92 + Math.sin(time * 8.5 + b.id) * 0.08
      this.instance('glow', b.x + forge.x, 0.78, b.z + forge.z, 0.62 * pulse, 0.3, 0.62 * pulse, 0xff853d)
      for (let i = 0; i < 2; i++) {
        const drift = Math.sin(time * 1.05 + b.id * 0.5 + i) * 0.16
        const rise = (time * 0.28 + i * 0.5) % 1
        this.instance(
          'smoke',
          b.x + chimney.x + drift,
          3.45 + rise * 1.6,
          b.z + chimney.z,
          0.44 + rise * 0.42,
          0.38 + rise * 0.36,
          0.44 + rise * 0.42,
          night > 0.6 ? 0x555e68 : 0x787b7d,
        )
      }
    }
  }

  private renderFortification(b: Building, rotation: number, color: number): void {
    if (b.type === 'wood-wall') {
      this.instance('fortifications', b.x, 0.72, b.z, 0.88, 1.38, 0.72, color, rotation)
      for (const localX of [-0.32, 0.32]) {
        const o = this.rotatedOffset(localX, 0, rotation)
        this.instance('trim', b.x + o.x, 0.83, b.z + o.z, 0.14, 1.7, 0.16, 0x4f3827, rotation)
      }
      return
    }

    this.instance('fortifications', b.x, 0.9, b.z, 0.82, 1.8, 0.75, color, rotation)
    this.instance('fortifications', b.x, 1.72, b.z, 1.36, 0.2, 0.32, 0x513828, rotation)
    const left = this.rotatedOffset(-0.31, 0, rotation)
    const right = this.rotatedOffset(0.31, 0, rotation)
    this.instance('trim', b.x + left.x, 0.95, b.z + left.z, 0.12, 1.95, 0.16, 0x493326, rotation)
    this.instance('trim', b.x + right.x, 0.95, b.z + right.z, 0.12, 1.95, 0.16, 0x493326, rotation)
  }

  sync(state: WorldState, selectedId: number | null): void {
    for (const mesh of Object.values(this.batches)) mesh.count = 0

    const atmosphere = atmosphereForTime(state.timeOfDay)
    const night = atmosphere.night
    const time = state.elapsedSeconds
    this.updateNightMaterialLift(night)

    for (let i = 0; i < 46; i++) {
      const x = ((i * 17) % 43) - 21
      const z = ((i * 29 + 7) % 43) - 21
      const sx = 1.4 + (i % 4) * 0.52
      const sz = 0.9 + ((i * 3) % 5) * 0.34
      this.instance(
        'groundPatch',
        x,
        0.018,
        z,
        sx,
        1,
        sz,
        i % 3 === 0 ? 0x4f6243 : i % 3 === 1 ? 0x68734c : 0x596b4d,
        (i % 7) * 0.31,
      )
    }

    for (const n of state.nodes) {
      if (n.remaining <= 0) continue
      if (n.resource === 'wood') {
        this.instance('wood', n.x, 1.4, n.z)
        if (night > 0.12) {
          this.instance('treeMoon', n.x + 0.11, 2.18, n.z - 0.11, 0.82, 0.7, 0.82, 0x60758a, n.id * 0.17)
        }
      } else if (n.resource === 'food') {
        this.instance('food', n.x, 0.5, n.z, 1, 1, 1, night > 0.45 ? 0x829b65 : undefined)
      } else if (n.resource === 'ore') {
        this.instance('ore', n.x, 0.42, n.z, 1.05, 0.78, 1.05, night > 0.45 ? 0x657487 : undefined, n.id * 0.31)
        this.instance('ore', n.x + 0.38, 0.24, n.z - 0.24, 0.58, 0.46, 0.58, 0x5d6570, n.id * 0.53)
      }
    }

    for (const a of state.settlers) {
      const hit = this.recentlyHit(a.lastHitTick, state.tick)
      const color = hit ? 0xff7868 : a.health <= 0 ? 0x555555 : undefined
      this.instance(a.role === 'guard' ? 'guards' : 'settlers', a.x, 0.55, a.z, 1, 1, 1, color)
      this.healthBar(a.x, 1.25, a.z, a.health, a.maxHealth, 0.8)

      const resource = RESOURCE_IDS.find(resource => a.cargo[resource] > 0) ?? null
      if (resource) {
        this.instance('cargo', a.x + 0.28, 0.85, a.z, 0.38, 0.38, 0.38, RESOURCES[resource].color)
      }
    }

    for (const e of state.enemies) {
      const hit = this.recentlyHit(e.lastHitTick, state.tick)
      const color = hit ? 0xff6558 : e.health <= e.maxHealth * 0.5 ? 0x8f3333 : undefined
      this.instance('enemies', e.x, 0.56, e.z, 1, 1, 1, color)
      this.healthBar(e.x, 1.3, e.z, e.health, e.maxHealth, 0.9)
    }

    const playerHit = this.recentlyHit(state.player.lastHitTick, state.tick)
    this.instance(
      'player', state.player.x, 0.7, state.player.z, 1, 1, 1,
      playerHit ? 0xff7868 : state.player.health <= 0 ? 0x456064 : undefined,
    )
    this.healthBar(state.player.x, 1.55, state.player.z, state.player.health, state.player.maxHealth, 1.05)

    let glowX = 0
    let glowZ = 0
    let glowWeight = 0
    const occupiedHomes = new Set(state.settlers.map(settler => settler.homeId).filter((id): id is number => id !== null))
    const productionPhaseActive = state.timeOfDay >= 6 / 24 && state.timeOfDay < 18 / 24

    for (const b of state.buildings) {
      const def = BUILDINGS[b.type]
      const hit = this.recentlyHit(b.lastHitTick, state.tick)
      const rotation = (b.rotation ?? 0) * Math.PI / 2
      const damage = damageVisualStage(b.health, b.maxHealth, b.destroyed)
      const intactColor = this.damagedColor(def.color, damage)
      const baseColor = hit ? 0xff705e : this.readableNightColor(intactColor, night)

      if (b.complete || b.work > 0) {
        this.instance(
          'groundWear',
          b.x,
          0.026,
          b.z,
          Math.max(1.15, def.footprint * 0.92 + 0.65),
          1,
          Math.max(1.15, def.footprint * 0.92 + 0.65),
          b.destroyed ? 0x473f35 : 0x655b43,
          rotation,
        )
      }

      if (damage === 'ruin') {
        this.ruinVisual(b, rotation)
      } else if (!b.complete) {
        this.constructionVisual(b, def, rotation)
      } else if (def.fortification) {
        this.renderFortification(b, rotation, baseColor)
      } else if (b.type === 'campfire') {
        this.instance('buildings', b.x, 0.12, b.z, 1.18, 0.24, 1.18, baseColor)
        const flicker = 0.92 + Math.sin(time * 11 + b.id) * 0.08
        this.instance('campfireFire', b.x, 0.58, b.z, flicker * 1.08, 1.08 + flicker * 0.2, flicker * 1.08, hit ? 0xff705e : 0xf0a14a)
        this.instance('campfireCore', b.x, 0.66, b.z, flicker * 0.82, 0.95 + flicker * 0.16, flicker * 0.82, 0xffd06a)
        this.instance('glow', b.x, 0.56, b.z, 0.9 + night * 0.35, 0.64, 0.9 + night * 0.35, 0xffa34d)
        this.campfireGroundPool(b.x, b.z, 4.25, Math.max(night, atmosphere.twilight * 0.85))
        glowX += b.x * 1.4
        glowZ += b.z * 1.4
        glowWeight += 1.4
      } else if (b.type === 'stockpile') {
        this.renderStockpile(b, rotation, baseColor, night)
      } else if (b.type === 'house') {
        const occupiedNight = occupiedHomes.has(b.id) ? night : night * 0.18
        this.renderHouse(b, rotation, baseColor, occupiedNight)
        if (occupiedHomes.has(b.id)) {
          const houseLight = this.rotatedOffset(0, 1.15, rotation)
          this.warmGroundPool(b.x + houseLight.x, b.z + houseLight.z, 4.15, 0.34, occupiedNight)
          glowX += b.x + houseLight.x * 0.35
          glowZ += b.z
          glowWeight++
        }
      } else if (b.type === 'guard-post') {
        this.renderGuardPost(b, rotation, baseColor)
      } else if (b.type === 'tavern') {
        const serviceNight = b.inventory.ale > 0 ? night : night * 0.35
        this.renderTavern(b, rotation, baseColor, serviceNight)
        if (b.inventory.ale > 0) {
          const tavernLight = this.rotatedOffset(0, 1.25, rotation)
          this.warmGroundPool(b.x + tavernLight.x, b.z + tavernLight.z, 5.1, 0.42, serviceNight)
          glowX += (b.x + tavernLight.x * 0.45) * 1.8
          glowZ += (b.z + tavernLight.z * 0.45) * 1.8
          glowWeight += 1.8
        }
      } else if (b.type === 'brewery') {
        this.renderBrewery(b, rotation, baseColor, time, night, productionPhaseActive)
      } else if (b.type === 'blacksmith') {
        this.renderBlacksmith(b, rotation, baseColor, time, night, productionPhaseActive)
      } else {
        this.instance('buildings', b.x, 0.4, b.z, 2.8, 0.8, 2.8, baseColor, rotation)
      }

      if (b.complete && !b.destroyed && (damage === 'damaged' || damage === 'critical')) {
        const o = this.rotatedOffset(1.0, -1.0, rotation)
        this.instance('debris', b.x + o.x, 0.12, b.z + o.z, 0.55, 0.18, 0.3, 0x493d34, rotation + 0.5)
      }

      if (b.complete && (b.health < b.maxHealth || b.id === selectedId)) {
        const barY = def.fortification ? 2.2 : b.type === 'house' ? 3.8 : b.type === 'tavern' ? 3.65 : b.type === 'brewery' || b.type === 'blacksmith' ? 3.55 : b.type === 'campfire' ? 1.15 : 2.8
        this.healthBar(b.x, barY, b.z, b.health, b.maxHealth, def.fortification ? 1.1 : 2.2)
      }

      if (!b.complete) {
        const cost = RESOURCE_IDS.reduce((sum, resource) => sum + def.buildCost[resource], 0)
        const delivered = RESOURCE_IDS.reduce((sum, resource) => sum + b.delivered[resource], 0)
        const ratio = (delivered / Math.max(cost, 1) + b.work / def.constructionWork) / 2
        const y = def.fortification ? 2.05 : 3.05
        const width = def.fortification ? 0.9 : Math.max(1.3, def.footprint * 0.88)
        this.instance('progress', b.x - width / 2 + ratio * width / 2, y, b.z, Math.max(0.04, ratio * width), 0.12, 0.18)
      }
    }

    for (const mesh of Object.values(this.batches)) {
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }

    const selected = [...state.settlers, ...state.enemies, ...state.nodes, ...state.buildings].find(e => e.id === selectedId)
    this.selection.visible = !!selected
    if (selected) {
      this.selection.position.set(selected.x, 0.045, selected.z)
      const building = state.buildings.find(b => b.id === selected.id)
      const footprint = building ? BUILDINGS[building.type].footprint : 0.9
      const pulse = 1 + Math.sin(time * 3.5) * 0.003
      this.selection.scale.set(footprint * 1.06 * pulse, footprint * 1.06 * pulse, 1)
    }

    this.sun.intensity = atmosphere.sunIntensity
    this.moon.intensity = atmosphere.moonIntensity
    this.ambient.intensity = atmosphere.ambientIntensity
    this.sun.color.copy(this.sunDayColor).lerp(this.sunTwilightColor, atmosphere.twilight * 0.3)
    this.moon.color.set(0xb7cdff)
    this.ambient.color.copy(this.ambientDayColor).lerp(this.ambientTwilightColor, atmosphere.twilight * 0.18)
    this.ambient.groundColor.copy(this.ambientGroundNight).lerp(this.ambientGroundDay, atmosphere.daylight * 0.5)

    const sky = (this.scene.background as THREE.Color)
      .copy(this.nightColor)
      .lerp(this.dayColor, atmosphere.daylight)
      .lerp(this.twilightColor, atmosphere.twilight * (0.38 + atmosphere.night * 0.1))
    const fog = this.scene.fog
    if (fog instanceof THREE.Fog) {
      fog.color.copy(this.fogNightTint).lerp(sky, 0.18 + atmosphere.daylight * 0.68).lerp(this.fogDayTint, atmosphere.daylight * 0.08)
      fog.near = atmosphere.fogNear
      fog.far = atmosphere.fogFar
    }
    this.groundMaterial.color.copy(this.nightGround).lerp(this.dayGround, atmosphere.daylight)

    if (glowWeight > 0) {
      this.settlementGlow.position.set(glowX / glowWeight, 2.35, glowZ / glowWeight)
      this.settlementGlow.intensity = atmosphere.night * Math.min(58, 20 + glowWeight * 4)
      this.settlementGlow.distance = Math.min(30, 18 + glowWeight)
    } else {
      this.settlementGlow.intensity = 0
    }

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
    this.ghostLine.visible = false
    this.ghostLine.count = 0
    this.facing.visible = false
    if (!type || !p) return

    const def = BUILDINGS[type]
    const rotation = ((rotationSteps % 4) + 4) % 4 * Math.PI / 2
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
      this.ghost.position.set(p.x, height / 2, p.z)
      this.ghost.rotation.set(0, rotation, 0)
      this.ghost.scale.set(
        def.fortification ? 0.92 : def.footprint * 0.92,
        height,
        def.fortification ? 0.82 : def.footprint * 0.92,
      )
      ;(this.ghost.material as THREE.MeshBasicMaterial).color.copy(color)
    }

    if (!def.fortification && type !== 'campfire' && type !== 'stockpile') {
      const distance = def.footprint / 2 + 0.65
      this.facing.visible = true
      this.facing.position.set(
        p.x + Math.sin(rotation) * distance,
        0.08,
        p.z + Math.cos(rotation) * distance,
      )
      this.facing.rotation.set(0, rotation, 0)
      this.facing.scale.set(0.28, 0.08, 0.7)
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

    geometries.forEach(g => g.dispose())
    materials.forEach(m => m.dispose())
    this.radialGlowTexture.dispose()
    this.sun.shadow.dispose()
    this.renderer.dispose()
  }
}
