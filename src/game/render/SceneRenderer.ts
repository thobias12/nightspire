import * as THREE from 'three'
import { BUILDINGS, type BuildingId, type BuildingDefinition } from '../data/buildings'
import { RESOURCE_IDS, RESOURCES } from '../data/resources'
import { MAP_SIZE } from '../simulation/Navigation'
import { plotCorners, residentialPlotWidth, type ResidentialPlotPreview } from '../simulation/TownPlanning'
import type { Building, Point, ResidentialPlot, RoadPath, WorldState } from '../simulation/WorldState'
import { atmosphereForTime, constructionVisualStage, damageVisualStage, type DamageVisualStage } from './VisualState'
import { residentialPresentationProfile, type ResidentialPresentationProfile } from './ResidentialPresentation'
import { TOWN_PALETTE, visualRoadStrip } from './TownPresentation'

export type CameraMode = 'settlement' | 'follow'

function createGableRoofGeometry(): THREE.BufferGeometry {
  const indexed = new THREE.BufferGeometry()
  const vertices = new Float32Array([
    -0.5, 0, -0.5,
     0.5, 0, -0.5,
     0, 0.5, -0.5,
    -0.5, 0,  0.5,
     0.5, 0,  0.5,
     0, 0.5,  0.5,
  ])

  // Outward-facing front/back gables and the two roof slopes only.
  // Deliberately omit the horizontal underside: the old mesh wound every face
  // inward and left an upward-facing bottom exactly coplanar with the wall top,
  // which caused the full-roof zoom-dependent z-fighting seen in live videos.
  const indices = [
    0, 2, 1, // front gable (-Z)
    3, 4, 5, // back gable (+Z)
    0, 3, 5, 0, 5, 2, // left roof slope
    1, 2, 5, 1, 5, 4, // right roof slope
  ]
  indexed.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
  indexed.setIndex(indices)

  const geometry = indexed.toNonIndexed()
  indexed.dispose()
  geometry.computeVertexNormals()
  return geometry
}

function createRoofCourseGeometry(slope: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(1, 1, 1).rotateZ(slope)
}

function createCartWheelGeometry(): THREE.BufferGeometry {
  return new THREE.TorusGeometry(0.5, 0.09, 5, 10).rotateY(Math.PI / 2)
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
    'stone', 'plaster', 'timber', 'metal', 'cloth', 'barrels', 'sacks', 'logs', 'baskets',
    'braceL', 'braceR', 'cartWheel',
    'adultTorso', 'adultSkirt', 'adultHead', 'adultHair', 'adultHairLong', 'adultArm', 'adultLeg', 'adultBodice',
    'guardCoat', 'entertainer',
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
      new THREE.PlaneGeometry(MAP_SIZE + 20, MAP_SIZE + 20),
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

    this.addBatch('wood', new THREE.ConeGeometry(0.65, 2.8, 7), 0x354d36, 1600)
    this.addBatch('treeTrunk', new THREE.CylinderGeometry(0.14, 0.2, 1, 7), 0x4e3828, 1000)
    this.addBatch('underbrush', new THREE.DodecahedronGeometry(0.45, 0), 0x496246, 1300)
    this.addBasicBatch('treeMoon', new THREE.ConeGeometry(0.72, 1.35, 7), 0x60758a, 1000, 0.2)
    this.addBatch('food', new THREE.DodecahedronGeometry(0.65, 0), 0x91a95d, 1000)
    this.addBatch('ore', new THREE.DodecahedronGeometry(0.58, 0), 0x737b86, 360)
    this.addBasicBatch('roadShoulder', new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), 0xa18d69, 1200, 0.12)
    this.addBasicBatch('roadBase', new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), 0x967b59, 1200)
    this.addBasicBatch('roadWear', new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), 0x755c41, 1400)
    this.addBasicBatch('roadEdgePatch', new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2), 0x8d7d5f, 1400, 0.32)
    this.addBasicBatch('roadMud', new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2), 0x66523d, 720, 0.34)
    this.addBasicBatch('roadStone', new THREE.DodecahedronGeometry(0.12, 0), 0x70695f, 720)
    this.addBasicBatch('plotGround', new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), 0x675940, 160, 0.035)
    this.addBasicBatch('yardPatch', new THREE.CircleGeometry(1, 18).rotateX(-Math.PI / 2), 0x66563f, 320, 0.28)
    this.addBatch('gardenRow', new THREE.BoxGeometry(1, 0.08, 1), 0x5f6941, 420)
    this.addBatch('chicken', new THREE.SphereGeometry(0.16, 6, 4), 0xb9a477, 160)
    this.addBatch('stone', this.geometry, TOWN_PALETTE.stone, 1200)
    this.addBatch('plaster', this.geometry, TOWN_PALETTE.plasterWarm, 700)
    this.addBatch('timber', this.geometry, TOWN_PALETTE.timberDark, 2600)
    this.addBatch('metal', this.geometry, TOWN_PALETTE.iron, 520)
    this.addBatch('cloth', this.geometry, TOWN_PALETTE.clothWine, 420)
    this.addBatch('barrels', new THREE.CylinderGeometry(0.5, 0.5, 1, 10), 0x765033, 620)
    this.addBatch('sacks', new THREE.SphereGeometry(0.5, 8, 6), 0x9a865e, 620)
    this.addBatch('baskets', new THREE.CylinderGeometry(0.34, 0.28, 0.42, 8), 0x9a7447, 420)
    this.addBatch('logs', new THREE.CylinderGeometry(0.18, 0.22, 1, 8).rotateZ(Math.PI / 2), 0x725037, 1100)
    this.addBatch('gableRoofs', createGableRoofGeometry(), TOWN_PALETTE.roofBrown, 520)
    {
      const roofMaterial = this.batches.gableRoofs.material as THREE.MeshStandardMaterial
      roofMaterial.flatShading = true
      roofMaterial.roughness = 1
      roofMaterial.metalness = 0
      roofMaterial.dithering = true
      roofMaterial.needsUpdate = true
    }
    this.addBatch('braceL', createRoofCourseGeometry(0.68), TOWN_PALETTE.timberDark, 900)
    this.addBatch('braceR', createRoofCourseGeometry(-0.68), TOWN_PALETTE.timberDark, 900)
    this.addBatch('cartWheel', createCartWheelGeometry(), 0x4d3728, 160)
    this.addBatch('adultTorso', new THREE.CapsuleGeometry(0.2, 0.34, 3, 6), 0x8b6a51, 100)
    this.addBatch('adultSkirt', new THREE.ConeGeometry(0.32, 0.65, 8), 0x77535a, 100)
    this.addBatch('adultHead', new THREE.SphereGeometry(0.18, 8, 6), 0xd6ad8b, 120)
    this.addBatch('adultHair', new THREE.SphereGeometry(0.19, 8, 6), 0x4a3528, 120)
    this.addBatch('adultHairLong', new THREE.CapsuleGeometry(0.16, 0.38, 3, 6), 0x4a3528, 80)
    this.addBatch('adultArm', new THREE.CapsuleGeometry(0.055, 0.34, 2, 5), 0xd6ad8b, 220)
    this.addBatch('adultLeg', new THREE.CapsuleGeometry(0.075, 0.35, 2, 5), 0x463a32, 160)
    this.addBatch('adultBodice', new THREE.CapsuleGeometry(0.19, 0.22, 3, 6), TOWN_PALETTE.clothWine, 80)
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
    this.addBasicBatch('groundPatch', new THREE.CircleGeometry(1, 9).rotateX(-Math.PI / 2), 0x596746, 240, 0.12)
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
    const noCastShadow = ['treeMoon', 'campfireCore', 'windowHalo', 'windowGlow', 'warmPool', 'campfirePool', 'glow', 'smoke', 'groundPatch', 'groundWear', 'roadShoulder', 'roadBase', 'roadWear', 'roadEdgePatch', 'roadMud', 'roadStone', 'plotGround', 'yardPatch', 'gableRoofs']
    const noReceiveShadow = [...noCastShadow]
    mesh.castShadow = !name.startsWith('health') && !noCastShadow.includes(name)
    mesh.receiveShadow = !name.startsWith('health') && !noReceiveShadow.includes(name)
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
      const o = this.rotatedOffset(side * sideOffset, 0.055, rotation)
      this.instance('timber', x + o.x, y, z + o.z, 0.055, height + 0.18, 0.07, frameColor, rotation)
    }
    this.instance('timber', x, y + topOffset, z, width + 0.18, 0.055, 0.07, frameColor, rotation)
    this.instance('timber', x, y - topOffset, z, width + 0.18, 0.055, 0.07, frameColor, rotation)

    if (seed % 2 === 0) {
      for (const side of [-1, 1] as const) {
        const shutter = this.rotatedOffset(side * (width * 0.82 + 0.12), 0.075, rotation)
        this.instance('timber', x + shutter.x, y, z + shutter.z, width * 0.38, height * 0.88, 0.055, side < 0 ? 0x69503a : 0x614934, rotation)
      }
    }
  }

  private doorAwning(b: Building, rotation: number, doorX: number, frontZ: number, seed: number): void {
    if (seed % 3 === 0) return
    const canopy = this.rotatedOffset(doorX, frontZ + 0.26, rotation)
    this.instance('timber', b.x + canopy.x, 1.58, b.z + canopy.z, 1.05, 0.09, 0.56, seed % 2 ? 0x654831 : 0x5b402d, rotation)
    for (const side of [-1, 1] as const) {
      const post = this.rotatedOffset(doorX + side * 0.43, frontZ + 0.43, rotation)
      this.instance('timber', b.x + post.x, 0.74, b.z + post.z, 0.075, 1.32, 0.075, 0x493327, rotation)
    }
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
      gableRoofs: 0.42,
      doors: 0.28,
      trim: 0.4,
      props: 0.42,
      stone: 0.2,
      plaster: 0.32,
      timber: 0.24,
      metal: 0.28,
      cloth: 0.2,
      barrels: 0.22,
      sacks: 0.18,
      baskets: 0.17,
      logs: 0.2,
      braceL: 0.23,
      braceR: 0.23,
      cartWheel: 0.18,
      adultTorso: 0.2,
      adultSkirt: 0.2,
      adultHead: 0.12,
      adultHair: 0.14,
      adultHairLong: 0.14,
      adultArm: 0.11,
      adultLeg: 0.16,
      adultBodice: 0.2,
      guardCoat: 0.24,
      entertainer: 0.2,
      foundation: 0.3,
      scaffold: 0.34,
      debris: 0.26,
      wood: 0.24,
      treeTrunk: 0.18,
      underbrush: 0.14,
      gardenRow: 0.12,
      chicken: 0.14,
      food: 0.16,
    }
    for (const [name, strength] of Object.entries(strengths)) {
      const material = this.batches[name]?.material
      if (!(material instanceof THREE.MeshStandardMaterial)) continue
      material.emissive.setHex(['wood', 'treeTrunk', 'underbrush', 'gardenRow', 'food'].includes(name) ? forest : cool)
      material.emissiveIntensity = night * strength
    }
  }

  private renderVisualRoads(roads: RoadPath[]): void {
    for (const road of roads) {
      for (let i = 1; i < road.points.length; i++) {
        const a = road.points[i - 1]
        const b = road.points[i]
        const strip = visualRoadStrip({ fromId: road.id, toId: i, ax: a.x, az: a.z, bx: b.x, bz: b.z })
        if (strip.length < 0.02) continue

        const tangentX = (b.x - a.x) / strip.length
        const tangentZ = (b.z - a.z) / strip.length
        const normalX = Math.cos(strip.angle)
        const normalZ = -Math.sin(strip.angle)
        const pieceCount = Math.max(1, Math.ceil(strip.length / 2.35))
        const pieceLength = strip.length / pieceCount

        for (let piece = 0; piece < pieceCount; piece++) {
          const t = (piece + 0.5) / pieceCount
          const seed = road.id * 13.17 + i * 7.31 + piece * 3.73
          const lateral = Math.sin(seed * 1.21) * Math.min(0.12, road.width * 0.055)
          const widthScale = 0.9 + (Math.sin(seed * 0.77) * 0.5 + 0.5) * 0.14
          const width = road.width * widthScale
          const px = a.x + (b.x - a.x) * t + normalX * lateral
          const pz = a.z + (b.z - a.z) * t + normalZ * lateral
          const length = pieceLength + 0.28

          // Overlapping short pieces vary width/lateral offset enough to stop the road
          // from reading as one perfectly extruded brown ribbon.
          const shoulderColor = piece % 3 === 0 ? 0x9a896b : piece % 3 === 1 ? 0x938066 : 0xa08d6c
          const baseColor = piece % 4 === 0 ? 0x8e7253 : piece % 4 === 1 ? 0x987b58 : piece % 4 === 2 ? 0x927252 : 0x9c805e
          this.instance('roadShoulder', px, 0.020, pz, width * 1.24, 1, length + 0.22, shoulderColor, strip.angle)
          this.instance('roadBase', px, 0.025, pz, width, 1, length, baseColor, strip.angle)

          // Circular edge stains overlap the rectangular pieces and dissolve the hard
          // road boundary into grass/soil without changing road topology.
          for (const side of [-1, 1] as const) {
            const edgeSeed = seed + side * 4.9
            const edgeOffset = width * (0.5 + Math.sin(edgeSeed) * 0.035)
            const edgeX = px + normalX * edgeOffset * side + tangentX * Math.sin(edgeSeed * 1.7) * 0.24
            const edgeZ = pz + normalZ * edgeOffset * side + tangentZ * Math.sin(edgeSeed * 1.7) * 0.24
            this.instance(
              'roadEdgePatch',
              edgeX,
              0.027,
              edgeZ,
              0.42 + (Math.cos(edgeSeed) * 0.5 + 0.5) * 0.34,
              1,
              0.28 + (Math.sin(edgeSeed * 0.83) * 0.5 + 0.5) * 0.32,
              side > 0 ? 0x887a60 : 0x8f8064,
              edgeSeed,
            )

            if ((road.id + i + piece + (side > 0 ? 1 : 0)) % 4 === 0) {
              this.instance(
                'underbrush',
                edgeX + normalX * side * 0.12,
                0.11,
                edgeZ + normalZ * side * 0.12,
                0.22 + (piece % 3) * 0.05,
                0.18,
                0.22 + (piece % 2) * 0.05,
                0x566849,
                edgeSeed,
              )
            }

            if ((road.id * 3 + i + piece + (side > 0 ? 2 : 0)) % 7 === 0) {
              this.instance(
                'roadStone',
                edgeX + normalX * side * 0.18,
                0.065,
                edgeZ + normalZ * side * 0.18,
                0.75 + (piece % 3) * 0.14,
                0.55 + (piece % 2) * 0.1,
                0.82,
                piece % 2 ? 0x70685d : 0x665f56,
                edgeSeed * 0.4,
              )
            }
          }

          const rutOffset = width * 0.19
          const rutWidth = Math.max(0.055, width * 0.05)
          if ((road.id + i + piece) % 5 !== 2) {
            const rutLength = length * (0.48 + ((piece + road.id) % 3) * 0.12)
            const rutShift = tangentX * Math.sin(seed * 2.1) * 0.18
            const rutShiftZ = tangentZ * Math.sin(seed * 2.1) * 0.18
            this.instance('roadWear', px + normalX * rutOffset + rutShift, 0.03, pz + normalZ * rutOffset + rutShiftZ, rutWidth, 1, rutLength, 0x70563d, strip.angle)
            if ((road.id + piece) % 3 !== 1) {
              this.instance('roadWear', px - normalX * rutOffset - rutShift, 0.031, pz - normalZ * rutOffset - rutShiftZ, rutWidth * 0.9, 1, rutLength * 0.86, 0x785e43, strip.angle)
            }
          }

          if ((road.id + i * 2 + piece) % 6 === 0) {
            this.instance(
              'roadMud',
              px + normalX * Math.sin(seed) * width * 0.16,
              0.032,
              pz + normalZ * Math.sin(seed) * width * 0.16,
              width * (0.2 + (piece % 2) * 0.08),
              1,
              Math.max(0.4, length * 0.28),
              piece % 2 ? 0x65513d : 0x6d5841,
              strip.angle + Math.sin(seed) * 0.16,
            )
          }
        }
      }
    }
  }

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
        this.instance('timber', cx, 0.38, cz, half, 0.07, 0.08, 0x59402e, rotation)
        this.instance('timber', cx, 0.68, cz, half, 0.065, 0.075, 0x59402e, rotation)
      }
    } else {
      this.instance('timber', midX, 0.38, midZ, railLength, 0.07, 0.08, 0x59402e, rotation)
      this.instance('timber', midX, 0.68, midZ, railLength, 0.065, 0.075, 0x59402e, rotation)
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
      this.instance('timber', x, height / 2, z, 0.09, height, 0.09, i % 3 === 0 ? 0x4c382a : 0x463326, rotation)
    }
  }

  private plotCenter(plot: ResidentialPlot): Point {
    const frontageMid = {
      x: (plot.frontageA.x + plot.frontageB.x) / 2,
      z: (plot.frontageA.z + plot.frontageB.z) / 2,
    }
    const rear = this.rotatedOffset(0, -plot.depth / 2, plot.angle)
    return { x: frontageMid.x + rear.x, z: frontageMid.z + rear.z }
  }

  private residentialDoorOffset(profile: ResidentialPresentationProfile, seed: number, width: number): number {
    if (profile.form === 'wide-deep') return -profile.sidePassage * Math.min(0.82, width * 0.2)
    if (profile.form === 'long-burgage') return -profile.sidePassage * Math.min(0.42, width * 0.16)
    if (profile.form === 'wide-shallow') return (seed % 2 === 0 ? -1 : 1) * Math.min(0.66, width * 0.16)
    return ((seed % 3) - 1) * Math.min(profile.tier === 'homestead' ? 0.52 : 0.4, width * 0.17)
  }

  private residentialVisualPlacement(
    b: Building,
    plot: ResidentialPlot,
    profile: ResidentialPresentationProfile,
  ): { visualB: Building; doorX: number; frontClearance: number; localX: number } {
    const width = profile.houseWidth
    const depth = profile.houseDepth
    const center = this.plotCenter(plot)
    const right = this.rotatedOffset(1, 0, plot.angle)
    const towardRoad = this.rotatedOffset(0, 1, plot.angle)
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
    const visualOffset = this.rotatedOffset(lateralOffset, frontageOffset, plot.angle)
    const visualB = { ...b, x: b.x + visualOffset.x, z: b.z + visualOffset.z }
    const frontClearance = Math.max(0, frontDistance - frontageOffset - depth / 2)

    return {
      visualB,
      doorX: this.residentialDoorOffset(profile, plot.id, width),
      frontClearance,
      localX: clampedLocalX,
    }
  }

  private renderResidentialPlot(plot: ResidentialPlot, b: Building, night: number, plots: ResidentialPlot[]): void {
    const width = residentialPlotWidth(plot)
    const profile = residentialPresentationProfile(plot)
    const center = this.plotCenter(plot)
    const halfW = width / 2
    const halfD = plot.depth / 2
    this.instance('plotGround', center.x, 0.021, center.z, width * 0.94, 1, plot.depth * 0.94, plot.id % 2 ? 0x6a5a42 : 0x62543d, plot.angle)

    const corners = plotCorners(plot)
    const [frontA, frontB, rearB, rearA] = corners
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
        this.instance(
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
    const door = this.rotatedOffset(placement.doorX, profile.houseDepth / 2 + 0.2, plot.angle)
    const doorPoint = { x: placement.visualB.x + door.x, z: placement.visualB.z + door.z }
    const pathDx = doorPoint.x - frontMid.x
    const pathDz = doorPoint.z - frontMid.z
    const pathLength = Math.hypot(pathDx, pathDz)
    if (pathLength > 0.6) {
      this.instance(
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
        const p = this.rotatedOffset(localX, rearZ, plot.angle)
        this.instance('gardenRow', center.x + p.x, 0.07, center.z + p.z, 0.52, 1, Math.min(2.4, plot.depth * 0.28), i % 2 ? 0x59653f : 0x657048, plot.angle)
        for (let j = 0; j < 3; j++) {
          const plant = this.rotatedOffset(localX + (j - 1) * 0.12, rearZ - 0.55 + j * 0.48, plot.angle)
          this.instance('underbrush', center.x + plant.x, 0.18, center.z + plant.z, 0.28, 0.24, 0.28, 0x58714a, plot.id * 0.13 + i + j)
        }
      }
      const basket = this.rotatedOffset(Math.min(halfW - 0.45, 1.2), rearZ + 0.85, plot.angle)
      this.instance('baskets', center.x + basket.x, 0.2, center.z + basket.z, 0.5, 0.68, 0.5, 0x9b7546, plot.angle)
    } else if (plot.backyard === 'chickens') {
      const penCenter = this.rotatedOffset(0, rearZ, plot.angle)
      for (let i = 0; i < 5; i++) {
        const px = ((i % 3) - 1) * 0.42 + Math.sin(plot.id + i) * 0.09
        const pz = (Math.floor(i / 3) - 0.25) * 0.46
        const p = this.rotatedOffset(px, rearZ + pz, plot.angle)
        this.instance('chicken', center.x + p.x, 0.17, center.z + p.z, 1, 0.86, 1, i % 2 ? 0xc5ad7a : 0x9d815e, i * 0.7)
      }
      this.instance('timber', center.x + penCenter.x, 0.28, center.z + penCenter.z, Math.min(2.4, width * 0.55), 0.55, 0.08, 0x60452f, plot.angle)
      const coop = this.rotatedOffset(-Math.min(halfW - 0.52, 1.05), rearZ - 0.65, plot.angle)
      this.instance('timber', center.x + coop.x, 0.38, center.z + coop.z, 0.82, 0.68, 0.72, 0x654832, plot.angle)
      this.instance('gableRoofs', center.x + coop.x, 0.7, center.z + coop.z, 1.02, 0.42, 0.9, this.readableNightColor(0x6a553d, night), plot.angle)
    } else if (plot.backyard === 'workyard') {
      const shed = this.rotatedOffset(-Math.min(halfW - 0.8, 1.25), rearZ, plot.angle)
      this.instance('timber', center.x + shed.x, 0.48, center.z + shed.z, 1.15, 0.9, 0.95, 0x674a35, plot.angle)
      this.instance('gableRoofs', center.x + shed.x, 0.92, center.z + shed.z, 1.42, 0.56, 1.15, this.readableNightColor(0x69543b, night), plot.angle)
      for (let i = 0; i < 4; i++) {
        const log = this.rotatedOffset(0.45 + (i % 2) * 0.34, rearZ - 0.4 + Math.floor(i / 2) * 0.34, plot.angle)
        this.instance('logs', center.x + log.x, 0.18 + (i % 2) * 0.06, center.z + log.z, 0.5, 0.5, 0.5, 0x6a482f, plot.angle)
      }
    } else {
      for (let i = 0; i < 8; i++) {
        const log = this.rotatedOffset(-0.78 + (i % 4) * 0.42, rearZ - 0.35 + Math.floor(i / 4) * 0.35, plot.angle)
        this.instance('logs', center.x + log.x, 0.18 + (i % 2) * 0.06, center.z + log.z, 0.56, 0.56, 0.56, 0x6b4930, plot.angle)
      }
      const chopping = this.rotatedOffset(Math.min(halfW - 0.45, 1.25), rearZ + 0.5, plot.angle)
      this.instance('logs', center.x + chopping.x, 0.22, center.z + chopping.z, 0.45, 0.42, 0.45, 0x5f422e, plot.angle + Math.PI / 2)
      this.instance('metal', center.x + chopping.x, 0.48, center.z + chopping.z, 0.42, 0.06, 0.08, 0x596168, plot.angle + 0.3)
    }

    if (plot.id % 3 === 0) {
      const water = this.rotatedOffset(-Math.min(halfW - 0.4, 1.2), rearZ + 1.0, plot.angle)
      this.instance('barrels', center.x + water.x, 0.29, center.z + water.z, 0.36, 0.58, 0.36, 0x725036, plot.angle)
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
      const passage = this.rotatedOffset(passageX, frontZ - 0.28, plot.angle)
      this.instance('roadShoulder', center.x + passage.x, 0.023, center.z + passage.z, 0.44, 1, 1.2, 0x8b7657, plot.angle)

      for (const gateSide of [-1, 1] as const) {
        const post = this.rotatedOffset(passageX + gateSide * 0.29, frontZ - 0.02, plot.angle)
        this.instance('timber', center.x + post.x, 0.48, center.z + post.z, 0.1, 0.96, 0.1, 0x4d3829, plot.angle)
      }
      const lintel = this.rotatedOffset(passageX, frontZ - 0.02, plot.angle)
      this.instance('timber', center.x + lintel.x, 0.92, center.z + lintel.z, 0.72, 0.08, 0.09, 0x5c412e, plot.angle)

      const service = this.rotatedOffset(
        passageX - profile.sidePassage * 0.48,
        frontZ - 0.76,
        plot.angle,
      )
      if (plot.id % 2 === 0) {
        this.instance('barrels', center.x + service.x, 0.28, center.z + service.z, 0.34, 0.56, 0.34, 0x725036, plot.angle)
      } else {
        for (let i = 0; i < 3; i++) {
          const log = this.rotatedOffset(
            passageX - profile.sidePassage * 0.48,
            frontZ - 0.72 - i * 0.26,
            plot.angle,
          )
          this.instance('logs', center.x + log.x, 0.16 + i * 0.03, center.z + log.z, 0.46, 0.44, 0.44, 0x67462f, plot.angle)
        }
      }
    }

    if (profile.frontageStyle === 'open') return

    const gateHalf = Math.min(0.82, Math.max(0.56, width * 0.1))
    const addPost = (localX: number, height = 0.82) => {
      const p = this.rotatedOffset(localX, frontZ, plot.angle)
      this.instance('timber', center.x + p.x, height / 2, center.z + p.z, 0.09, height, 0.09, 0x4d3829, plot.angle)
    }
    const addHedge = (localX: number, scale = 0.65) => {
      const p = this.rotatedOffset(localX, frontZ - 0.04, plot.angle)
      this.instance('underbrush', center.x + p.x, 0.18, center.z + p.z, scale, 0.34, 0.44, 0x536a4b, plot.id * 0.29 + localX)
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
        const p = this.rotatedOffset(segmentCenter, frontZ, plot.angle)
        this.instance('timber', center.x + p.x, 0.38, center.z + p.z, segmentLength, 0.07, 0.08, 0x59402e, plot.angle)
        this.instance('timber', center.x + p.x, 0.67, center.z + p.z, segmentLength, 0.065, 0.075, 0x59402e, plot.angle)
        addPost(side * gateHalf)
      }
      return
    }

    // Gate style: stronger posts, short hedge shoulders and a simple overhead beam.
    for (const side of [-1, 1] as const) {
      addPost(side * gateHalf, 1.0)
      addHedge(side * Math.min(halfW - 0.48, gateHalf + 0.72), 0.68)
    }
    const lintel = this.rotatedOffset(0, frontZ, plot.angle)
    this.instance('timber', center.x + lintel.x, 0.94, center.z + lintel.z, gateHalf * 2 + 0.18, 0.08, 0.09, 0x58402f, plot.angle)
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
      const p = this.rotatedOffset(localX, localZ, plot.angle)
      const x = center.x + p.x
      const z = center.z + p.z
      const roofColor = this.readableNightColor(seed % 2 ? 0x66513e : 0x705b40, night)

      if (variant === 'lean-to') {
        for (const sx of [-structureWidth * 0.42, structureWidth * 0.42]) {
          const post = this.rotatedOffset(localX + sx, localZ, plot.angle)
          this.instance('timber', center.x + post.x, 0.46, center.z + post.z, 0.08, 0.92, 0.08, 0x4e3728, structureRotation)
        }
        this.instance('cloth', x, 0.92, z, structureWidth + 0.16, 0.08, structureDepth + 0.16, 0x725b43, structureRotation)
        this.instance('barrels', x, 0.26, z, 0.32, 0.52, 0.32, 0x705035, structureRotation)
        return
      }

      if (variant === 'covered-storage') {
        for (const sx of [-structureWidth * 0.4, structureWidth * 0.4]) {
          for (const sz of [-structureDepth * 0.34, structureDepth * 0.34]) {
            const post = this.rotatedOffset(localX + sx, localZ + sz, plot.angle)
            this.instance('timber', center.x + post.x, 0.5, center.z + post.z, 0.08, 1.0, 0.08, 0x4e3728, structureRotation)
          }
        }
        this.instance('gableRoofs', x, 0.98, z, structureWidth + 0.3, 0.54, structureDepth + 0.3, roofColor, structureRotation)
        for (let i = 0; i < 3; i++) {
          this.instance('barrels', x - 0.34 + i * 0.34, 0.26, z, 0.3, 0.52, 0.3, 0x725036, structureRotation)
        }
        return
      }

      if (variant === 'coop') {
        this.instance('timber', x, 0.42, z, structureWidth * 0.8, 0.72, structureDepth * 0.78, 0x654832, structureRotation)
        this.instance('gableRoofs', x, 0.78, z, structureWidth, 0.46, structureDepth, roofColor, structureRotation)
        for (let i = 0; i < 3; i++) {
          const chick = this.rotatedOffset(localX + (i - 1) * 0.28, localZ + structureDepth * 0.62, plot.angle)
          this.instance('chicken', center.x + chick.x, 0.17, center.z + chick.z, 1, 0.86, 1, i % 2 ? 0xc5ad7a : 0x9d815e, seed + i)
        }
        return
      }

      const plastered = variant === 'workshop'
      if (plastered) {
        this.instance('stone', x, 0.12, z, structureWidth + 0.12, 0.24, structureDepth + 0.12, 0x67635b, structureRotation)
        this.instance('plaster', x, 0.54, z, structureWidth, 0.86, structureDepth, seed % 2 ? 0x9d9077 : 0xa79a7d, structureRotation)
      } else {
        this.instance('timber', x, 0.5, z, structureWidth, 0.9, structureDepth, seed % 2 ? 0x674a35 : 0x60442f, structureRotation)
      }
      this.instance('gableRoofs', x, plastered ? 0.96 : 0.92, z, structureWidth + 0.34, plastered ? 0.58 : 0.54, structureDepth + 0.34, roofColor, structureRotation)

      if (plastered) {
        const bench = this.rotatedOffset(localX, localZ + structureDepth * 0.66, plot.angle)
        this.instance('timber', center.x + bench.x, 0.3, center.z + bench.z, Math.min(0.9, structureWidth * 0.72), 0.1, 0.28, 0x63462f, structureRotation)
        this.instance('metal', center.x + bench.x + 0.2, 0.46, center.z + bench.z, 0.32, 0.05, 0.08, 0x626a70, structureRotation + 0.2)
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
      const laneStart = this.rotatedOffset(laneX, halfD - 0.45, plot.angle)
      const laneEnd = this.rotatedOffset(laneX, rearZ + 0.42, plot.angle)
      const dx = laneEnd.x - laneStart.x
      const dz = laneEnd.z - laneStart.z
      this.instance('roadShoulder', center.x + (laneStart.x + laneEnd.x) / 2, 0.024, center.z + (laneStart.z + laneEnd.z) / 2, 0.34, 1, Math.hypot(dx, dz), 0x897354, Math.atan2(dx, dz))

      const rearUtility = this.rotatedOffset(buildSide * Math.min(halfW - 0.38, 1.05), rearZ + 1.08, plot.angle)
      this.instance('barrels', center.x + rearUtility.x, 0.28, center.z + rearUtility.z, 0.32, 0.54, 0.32, 0x725036, plot.angle)
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
      const laneStart = this.rotatedOffset(laneX, halfD - 0.45, plot.angle)
      const laneEnd = this.rotatedOffset(laneX, rearZ + 0.5, plot.angle)
      const dx = laneEnd.x - laneStart.x
      const dz = laneEnd.z - laneStart.z
      this.instance('roadShoulder', center.x + (laneStart.x + laneEnd.x) / 2, 0.024, center.z + (laneStart.z + laneEnd.z) / 2, profile.form === 'wide-deep' ? 0.42 : 0.36, 1, Math.hypot(dx, dz), 0x897354, Math.atan2(dx, dz))
    }

    const utility = this.rotatedOffset(-buildSide * Math.min(halfW - 0.45, 1.25), rearZ + 0.82, plot.angle)
    if (profile.tier === 'burgage') {
      this.instance('baskets', center.x + utility.x, 0.22, center.z + utility.z, 0.58, 0.74, 0.58, 0x967147, plot.angle)
      this.instance('barrels', center.x + utility.x + 0.34, 0.28, center.z + utility.z + 0.12, 0.33, 0.56, 0.33, 0x725036, plot.angle)
    } else {
      this.instance('sacks', center.x + utility.x, 0.22, center.z + utility.z, 0.42, 0.48, 0.38, 0x97845f, plot.angle)
    }
  }

  private renderYard(b: Building, rotation: number, radius: number, color = 0x66563f): void {
    const offset = this.rotatedOffset(0, 0.45, rotation)
    this.instance('yardPatch', b.x + offset.x, 0.022, b.z + offset.z, radius, 1, radius * 0.86, color, rotation + (b.id % 5) * 0.08)
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
      const eave = this.rotatedOffset(side * (width / 2 + 0.24), 0, rotation)
      this.instance('timber', b.x + eave.x, baseY + 0.03, b.z + eave.z, 0.11, 0.11, depth + 0.78, 0x493326, rotation)
    }
    this.instance('timber', b.x, baseY + roofHeight + 0.04, b.z, 0.13, 0.13, depth + 0.82, 0x443025, rotation)
  }

  private frontageClutter(b: Building, rotation: number, seed: number, spread = 1): void {
    const left = this.rotatedOffset(-0.9 * spread, 1.35 * spread, rotation)
    const right = this.rotatedOffset(0.9 * spread, 1.26 * spread, rotation)
    const near = this.rotatedOffset(0.18, 1.55 * spread, rotation)

    if (seed % 2 === 0) {
      this.instance('baskets', b.x + left.x, 0.22, b.z + left.z, 0.56, 0.78, 0.56, 0x9b7648, rotation)
      this.instance('sacks', b.x + right.x, 0.23, b.z + right.z, 0.4, 0.5, 0.36, 0x9a865e, rotation)
    } else {
      this.instance('barrels', b.x + left.x, 0.29, b.z + left.z, 0.38, 0.58, 0.38, 0x745033, rotation)
      this.instance('baskets', b.x + right.x, 0.2, b.z + right.z, 0.5, 0.7, 0.5, 0x9b7648, rotation)
    }

    this.instance('timber', b.x + near.x, 0.31, b.z + near.z, 0.72, 0.09, 0.24, 0x67472f, rotation)
    for (const lx of [-0.28, 0.28]) {
      const leg = this.rotatedOffset(0.18 + lx, 1.55 * spread, rotation)
      this.instance('timber', b.x + leg.x, 0.16, b.z + leg.z, 0.08, 0.3, 0.08, 0x513727, rotation)
    }
  }

  private renderCart(b: Building, rotation: number, localX: number, localZ: number, seed: number): void {
    const center = this.rotatedOffset(localX, localZ, rotation)
    const cartRotation = rotation + (seed % 2 === 0 ? 0.08 : -0.11)
    this.instance('timber', b.x + center.x, 0.42, b.z + center.z, 1.25, 0.18, 0.72, 0x6a4932, cartRotation)
    this.instance('timber', b.x + center.x, 0.66, b.z + center.z, 1.2, 0.08, 0.08, 0x543a29, cartRotation)
    for (const side of [-1, 1] as const) {
      const wheel = this.rotatedOffset(localX + side * 0.62, localZ, rotation)
      this.instance('cartWheel', b.x + wheel.x, 0.34, b.z + wheel.z, 0.66, 0.66, 0.66, 0x493326, cartRotation)
    }
    const shaft = this.rotatedOffset(localX, localZ + 1.0, rotation)
    this.instance('timber', b.x + shaft.x, 0.35, b.z + shaft.z, 0.08, 0.08, 1.8, 0x5b3f2d, cartRotation)
  }

  private renderLaundryLine(b: Building, rotation: number, localX: number, localZ: number, seed: number): void {
    const left = this.rotatedOffset(localX - 0.9, localZ, rotation)
    const right = this.rotatedOffset(localX + 0.9, localZ, rotation)
    this.instance('timber', b.x + left.x, 0.72, b.z + left.z, 0.08, 1.45, 0.08, 0x4d3829, rotation)
    this.instance('timber', b.x + right.x, 0.72, b.z + right.z, 0.08, 1.45, 0.08, 0x4d3829, rotation)
    const line = this.rotatedOffset(localX, localZ, rotation)
    this.instance('timber', b.x + line.x, 1.22, b.z + line.z, 1.82, 0.035, 0.035, 0x4e4135, rotation)
    for (let i = 0; i < 3; i++) {
      const cloth = this.rotatedOffset(localX - 0.58 + i * 0.58, localZ + 0.02, rotation)
      const colors = [0x8d6d5e, 0xb18b69, 0x6f6d62]
      this.instance('cloth', b.x + cloth.x, 1.0 - (i % 2) * 0.05, b.z + cloth.z, 0.4, 0.46, 0.035, colors[(seed + i) % colors.length], rotation)
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
    this.instance('stone', b.x, 0.18, b.z, width + 0.24, 0.36, depth + 0.24, TOWN_PALETTE.stoneDark, rotation)
    this.instance('plaster', b.x, 0.42 + wallHeight / 2, b.z, width, wallHeight, depth, plasterColor, rotation)

    const halfX = width / 2 + 0.045
    const halfZ = depth / 2 + 0.045
    for (const [lx, lz] of [[-halfX, -halfZ], [halfX, -halfZ], [-halfX, halfZ], [halfX, halfZ]] as const) {
      const o = this.rotatedOffset(lx, lz, rotation)
      this.instance('timber', b.x + o.x, 0.42 + wallHeight / 2, b.z + o.z, 0.13, wallHeight + 0.12, 0.13, TOWN_PALETTE.timberDark, rotation)
    }

    for (const y of [0.48, 0.42 + wallHeight * 0.54, 0.42 + wallHeight]) {
      const front = this.rotatedOffset(0, halfZ, rotation)
      const back = this.rotatedOffset(0, -halfZ, rotation)
      this.instance('timber', b.x + front.x, y, b.z + front.z, width + 0.16, 0.1, 0.11, TOWN_PALETTE.timberMid, rotation)
      this.instance('timber', b.x + back.x, y, b.z + back.z, width + 0.16, 0.1, 0.11, TOWN_PALETTE.timberMid, rotation)
      const left = this.rotatedOffset(-halfX, 0, rotation)
      const right = this.rotatedOffset(halfX, 0, rotation)
      this.instance('timber', b.x + left.x, y, b.z + left.z, 0.11, 0.1, depth + 0.16, TOWN_PALETTE.timberMid, rotation)
      this.instance('timber', b.x + right.x, y, b.z + right.z, 0.11, 0.1, depth + 0.16, TOWN_PALETTE.timberMid, rotation)
    }

    // Front/back diagonal braces break up the flat plaster panels.
    for (const lz of [-halfZ - 0.018, halfZ + 0.018]) {
      for (const side of [-1, 1] as const) {
        const brace = this.rotatedOffset(side * width * 0.22, lz, rotation)
        this.instance(
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
    this.instance('gableRoofs', b.x, 0.42 + wallHeight, b.z, roofWidth + 0.72, roofHeight * 2, roofDepth + 0.82, roofColor, roofRotation)
    this.roofDetails(b, roofRotation, roofWidth, roofDepth, wallHeight, roofHeight, roofColor)
  }

  private fenceLine(b: Building, rotation: number, localX: number, localZ: number, length: number, alongX: boolean): void {
    const center = this.rotatedOffset(localX, localZ, rotation)
    const segmentRotation = alongX ? rotation : rotation + Math.PI / 2
    this.instance('timber', b.x + center.x, 0.48, b.z + center.z, length, 0.09, 0.1, 0x604630, segmentRotation)
    this.instance('timber', b.x + center.x, 0.82, b.z + center.z, length, 0.08, 0.09, 0x604630, segmentRotation)
    for (const offset of [-length / 2, 0, length / 2]) {
      const post = this.rotatedOffset(localX + (alongX ? offset : 0), localZ + (alongX ? 0 : offset), rotation)
      this.instance('timber', b.x + post.x, 0.48, b.z + post.z, 0.11, 0.96, 0.11, 0x4e3828, rotation)
    }
  }

  private renderAdultFigure(
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

    const leftArm = this.rotatedOffset(-0.25, armSwing, facing)
    const rightArm = this.rotatedOffset(0.25, -armSwing, facing)
    const leftLeg = this.rotatedOffset(-0.11, 0, facing)
    const rightLeg = this.rotatedOffset(0.11, 0, facing)

    if (guard) {
      this.instance('guardCoat', x, 0.72 + bob, z, 1, 1, 1, 0x65504a, facing)
      this.instance('adultLeg', x + leftLeg.x, 0.27 + bob, z + leftLeg.z, 1, 0.92, 1, 0x383b3b, facing)
      this.instance('adultLeg', x + rightLeg.x, 0.27 + bob, z + rightLeg.z, 1, 0.92, 1, 0x383b3b, facing)
      this.instance('adultArm', x + leftArm.x, 0.82 + bob, z + leftArm.z, 0.92, 0.95, 0.92, 0x65504a, facing)
      this.instance('adultArm', x + rightArm.x, 0.82 + bob, z + rightArm.z, 0.92, 0.95, 0.92, 0x65504a, facing)
      this.instance('metal', x, 1.18 + bob, z, 0.42, 0.17, 0.42, 0x667078, facing)
    } else if (femaleSilhouette) {
      this.instance('adultSkirt', x, 0.43 + bob, z, 0.95, 1.02, 0.95, cloth, facing)
      this.instance('adultBodice', x, 0.91 + bob, z, 0.96, 0.98, 0.9, cloth, facing)
      this.instance('adultArm', x + leftArm.x, 0.89 + bob, z + leftArm.z, 0.92, 0.95, 0.92, skin, facing)
      this.instance('adultArm', x + rightArm.x, 0.89 + bob, z + rightArm.z, 0.92, 0.95, 0.92, skin, facing)
      const sash = this.rotatedOffset(0.02, 0.08, facing)
      this.instance('cloth', x + sash.x, 0.76 + bob, z + sash.z, 0.42, 0.08, 0.3, this.scratchColor.setHex(cloth).multiplyScalar(1.15).getHex(), facing)
    } else {
      this.instance('adultTorso', x, 0.72 + bob, z, 1.02, 1.06, 0.95, cloth, facing)
      this.instance('adultLeg', x + leftLeg.x, 0.26 + bob, z + leftLeg.z, 1, 0.95, 1, 0x3d342e, facing)
      this.instance('adultLeg', x + rightLeg.x, 0.26 + bob, z + rightLeg.z, 1, 0.95, 1, 0x3d342e, facing)
      this.instance('adultArm', x + leftArm.x, 0.82 + bob, z + leftArm.z, 0.92, 0.96, 0.92, cloth, facing)
      this.instance('adultArm', x + rightArm.x, 0.82 + bob, z + rightArm.z, 0.92, 0.96, 0.92, cloth, facing)
    }

    this.instance('adultHead', x, 1.31 + bob, z, 1, 1.06, 1, skin, facing)
    this.instance('adultHair', x, 1.42 + bob, z - 0.025, 1.04, 0.68, 1.04, hair, facing)
    if (femaleSilhouette || id % 4 === 1) {
      const back = this.rotatedOffset(0, -0.12, facing)
      this.instance('adultHairLong', x + back.x, 1.12 + bob, z + back.z, 0.92, femaleSilhouette ? 1.08 : 0.78, 0.78, hair, facing)
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
      const p = this.rotatedOffset(lx, lz, rotation)
      const sway = Math.sin(time * (1.5 + i * 0.12) + b.id + i) * 0.05 * activity
      const facing = rotation + Math.PI + sway

      if (i < 2) {
        const skin = i === 0 ? 0xd4a17d : 0xb97f62
        const hair = i === 0 ? 0x4b2e25 : 0x6a472f
        const left = this.rotatedOffset(-0.27, 0.02, facing)
        const right = this.rotatedOffset(0.27, -0.02, facing)
        const back = this.rotatedOffset(0, -0.13, facing)

        // Adult Tavern entertainers intentionally have a more polished/fitted
        // silhouette than workers: fitted bodice, flowing skirt, bare arms, long
        // hair and a metallic belt/jewelry accent. This remains stylized/non-explicit.
        this.instance('entertainer', b.x + p.x, 0.47, b.z + p.z, 1.05, 1.04, 1.05, color, facing)
        this.instance('adultBodice', b.x + p.x, 0.93, b.z + p.z, 1.08, 1.0, 0.92, this.scratchColor.setHex(color).multiplyScalar(1.08).getHex(), facing)
        this.instance('adultArm', b.x + p.x + left.x, 0.9, b.z + p.z + left.z, 1, 1, 1, skin, facing)
        this.instance('adultArm', b.x + p.x + right.x, 0.9, b.z + p.z + right.z, 1, 1, 1, skin, facing)
        this.instance('metal', b.x + p.x, 0.72, b.z + p.z, 0.44, 0.055, 0.34, 0xb49761, facing)
        this.instance('adultHead', b.x + p.x, 1.32, b.z + p.z, 1, 1.06, 1, skin, facing)
        this.instance('adultHair', b.x + p.x, 1.43, b.z + p.z - 0.02, 1.08, 0.7, 1.06, hair, facing)
        this.instance('adultHairLong', b.x + p.x + back.x, 1.13, b.z + p.z + back.z, 1, 1.18, 0.82, hair, facing)
      } else {
        this.renderAdultFigure(b.x + p.x, b.z + p.z, b.id * 10 + i, false, time, color, facing)
      }
    }
  }

  private renderStockpile(b: Building, rotation: number, color: number, night: number): void {
    this.renderYard(b, rotation, 2.45, 0x61543f)
    this.instance('stone', b.x, 0.1, b.z, 2.85, 0.2, 2.75, this.readableNightColor(0x6e695d, night), rotation)
    const roofColor = this.readableNightColor(TOWN_PALETTE.thatch, night)
    this.instance('gableRoofs', b.x, 1.58, b.z - 0.12, 2.95, 1.05, 2.5, roofColor, rotation)

    for (const [lx, lz] of [[-1.18, -0.9], [1.18, -0.9], [-1.18, 0.9], [1.18, 0.9]] as const) {
      const o = this.rotatedOffset(lx, lz, rotation)
      this.instance('timber', b.x + o.x, 0.78, b.z + o.z, 0.15, 1.55, 0.15, TOWN_PALETTE.timberDark, rotation)
    }
    const rear = this.rotatedOffset(0, -1.12, rotation)
    this.instance('timber', b.x + rear.x, 0.88, b.z + rear.z, 2.5, 0.12, 0.12, TOWN_PALETTE.timberMid, rotation)

    const woodStacks = Math.min(5, Math.ceil(b.inventory.wood / 40))
    for (let i = 0; i < woodStacks; i++) {
      const o = this.rotatedOffset(-0.75 + (i % 3) * 0.54, -0.45 + Math.floor(i / 3) * 0.52, rotation)
      this.instance('logs', b.x + o.x, 0.28 + (i % 2) * 0.09, b.z + o.z, 0.75, 0.75, 0.75, 0x704d33, rotation)
    }
    const foodSacks = Math.min(4, Math.ceil(b.inventory.food / 30))
    for (let i = 0; i < foodSacks; i++) {
      const o = this.rotatedOffset(0.62 + (i % 2) * 0.38, -0.45 + Math.floor(i / 2) * 0.48, rotation)
      this.instance('sacks', b.x + o.x, 0.28, b.z + o.z, 0.48, 0.62, 0.42, 0x9a865e, rotation)
    }
    const barrels = Math.min(3, Math.ceil(b.inventory.ale / 8))
    for (let i = 0; i < barrels; i++) {
      const o = this.rotatedOffset(-0.86 + i * 0.5, 0.66, rotation)
      this.instance('barrels', b.x + o.x, 0.36, b.z + o.z, 0.46, 0.72, 0.46, this.warmPropColor(0x765033, night, 0.12), rotation)
    }
    const oreCount = Math.min(4, Math.ceil(b.inventory.ore / 8))
    for (let i = 0; i < oreCount; i++) {
      const o = this.rotatedOffset(0.62 + (i % 2) * 0.42, 0.66 + Math.floor(i / 2) * 0.36, rotation)
      this.instance('ore', b.x + o.x, 0.22, b.z + o.z, 0.42, 0.36, 0.42, 0x68717a, rotation + i * 0.3)
    }
    if (b.inventory.tools > 0) {
      const rack = this.rotatedOffset(1.12, 0.08, rotation)
      this.instance('timber', b.x + rack.x, 0.52, b.z + rack.z, 0.12, 0.95, 0.12, 0x563d2b, rotation)
      for (let i = 0; i < Math.min(4, b.inventory.tools); i++) {
        const p = this.rotatedOffset(0.94, -0.22 + i * 0.16, rotation)
        this.instance('metal', b.x + p.x, 0.55 + i * 0.05, b.z + p.z, 0.42, 0.08, 0.08, 0x6f777c, rotation + 0.2)
      }
    }

    this.renderCart(b, rotation, -1.85, 0.55, b.id)
    const basket = this.rotatedOffset(1.2, -0.9, rotation)
    this.instance('baskets', b.x + basket.x, 0.21, b.z + basket.z, 0.62, 0.78, 0.62, 0x987044, rotation)
  }

  private renderHouse(b: Building, rotation: number, color: number, night: number, plot?: ResidentialPlot): void {
    const profile = plot ? residentialPresentationProfile(plot) : null
    const width = profile?.houseWidth ?? 2.48
    const depth = profile?.houseDepth ?? 2.22
    const wallHeight = profile?.wallHeight ?? 1.86
    const residentialPlacement = plot && profile ? this.residentialVisualPlacement(b, plot, profile) : null
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
      ? residentialPlacement?.doorX ?? this.residentialDoorOffset(profile, seed, width)
      : ((seed % 3) - 1) * Math.min(0.48, width * 0.16)

    const front = this.rotatedOffset(doorX, depth / 2 + 0.08, rotation)
    this.instance('doors', visualB.x + front.x, 0.82, visualB.z + front.z, 0.54, 1.35, 0.13, 0x4b3325, rotation)

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
      const win = this.rotatedOffset(lx, depth / 2 + 0.105, rotation)
      this.framedWindow(visualB.x + win.x, 1.3, visualB.z + win.z, rotation, night, 0.34, 0.44, seed + windowIndex)
      windowIndex += 1
    }

    if (plot && profile?.roofFront === 'gable' && (profile.form === 'long-burgage' || seed % 4 === 0)) {
      const loft = this.rotatedOffset(0, depth / 2 + 0.43, rotation)
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
      const sideWin = this.rotatedOffset(side * (width / 2 + 0.105), profile?.form === 'long-burgage' ? -0.35 : -0.15, rotation)
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
    const chimney = this.rotatedOffset(chimneySide * width * 0.3, -depth * 0.18, rotation)
    this.instance('stone', visualB.x + chimney.x, wallHeight + 0.72, visualB.z + chimney.z, 0.32, 1.45, 0.32, 0x66645f, rotation)

    if (plot && profile && residentialPlacement && (profile.form === 'wide-shallow' || profile.form === 'wide-deep')) {
      const baySide = plot.id % 2 === 0 ? -1 : 1
      const bayWidth = profile.form === 'wide-deep' ? 1.75 : 1.5
      const bayDepth = profile.form === 'wide-deep' ? 1.45 : 1.2
      const desiredProjection = profile.form === 'wide-deep' ? 0.38 : 0.28
      const safeProjection = Math.max(0.08, residentialPlacement.frontClearance - 0.28)
      const projection = Math.min(desiredProjection, safeProjection)
      const bayX = baySide * Math.min(width * 0.28, 0.92)
      const bayZ = depth / 2 - bayDepth / 2 + projection
      const bay = this.rotatedOffset(bayX, bayZ, rotation)
      this.instance('stone', visualB.x + bay.x, 0.13, visualB.z + bay.z, bayWidth + 0.12, 0.26, bayDepth + 0.12, 0x69645b, rotation)
      this.instance('plaster', visualB.x + bay.x, 0.72, visualB.z + bay.z, bayWidth, 1.24, bayDepth, plaster, rotation)
      this.instance(
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
      const bayWindow = this.rotatedOffset(bayX, bayZ + bayDepth / 2 + 0.08, rotation)
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
        const secondChimney = this.rotatedOffset(-chimneySide * width * 0.24, -depth * 0.26, rotation)
        this.instance('stone', visualB.x + secondChimney.x, wallHeight + 0.54, visualB.z + secondChimney.z, 0.28, 1.1, 0.28, 0x625f5a, rotation)
      }
    }

    if (plot && profile && (profile.form === 'wide-deep' || (profile.tier === 'homestead' && profile.form === 'balanced' && plot.id % 3 === 0))) {
      const dormer = this.rotatedOffset(-width * 0.18, depth * 0.15, rotation)
      this.instance('plaster', visualB.x + dormer.x, wallHeight + 0.78, visualB.z + dormer.z, 0.66, 0.44, 0.56, plaster, rotation)
      this.instance('gableRoofs', visualB.x + dormer.x, wallHeight + 0.98, visualB.z + dormer.z, 0.88, 0.48, 0.82, this.readableNightColor(roof, night), rotation)
      const dormerWindow = this.rotatedOffset(-width * 0.18, depth * 0.45, rotation)
      this.warmWindow(visualB.x + dormerWindow.x, wallHeight + 0.72, visualB.z + dormerWindow.z, rotation, night, 0.24, 0.28)
    }

    const step = this.rotatedOffset(doorX, depth / 2 + 0.22, rotation)
    this.instance('stone', visualB.x + step.x, 0.12, visualB.z + step.z, 0.76, 0.22, 0.48, 0x777064, rotation)
    this.doorAwning(visualB, rotation, doorX, depth / 2, seed)
    this.frontageClutter(visualB, rotation, seed, Math.min(1.05, width / 2.7))

    if (plot && profile && plot.depth >= 7.6 && (profile.tier !== 'cottage' || profile.form === 'long-burgage')) {
      const rearWidth = profile.form === 'long-burgage' ? 0.94 : profile.tier === 'burgage' ? 1.45 : 1.15
      const rearDepth = profile.form === 'long-burgage' ? 1.32 : profile.tier === 'burgage' ? 1.42 : 1.08
      const extensionSide = profile.sidePassage !== 0 ? -profile.sidePassage : (plot.id % 2 === 0 ? 1 : -1)
      const rearExtension = this.rotatedOffset(
        extensionSide * Math.min(width * 0.28, profile.form === 'long-burgage' ? 0.55 : 0.9),
        -depth / 2 - rearDepth * 0.42,
        rotation,
      )
      this.instance(
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
      this.instance(
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
      const wing = this.rotatedOffset(wingLocalX, -depth * 0.02, rotation)
      this.instance('stone', visualB.x + wing.x, 0.14, visualB.z + wing.z, wingWidth + 0.14, 0.28, wingDepth + 0.14, 0x67635b, wingRotation)
      this.instance('plaster', visualB.x + wing.x, 0.9, visualB.z + wing.z, wingWidth, 1.52, wingDepth, plaster, wingRotation)
      this.instance(
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
      const wingWindow = this.rotatedOffset(
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
        const returnWing = this.rotatedOffset(
          returnLocalX,
          -depth * 0.34,
          rotation,
        )
        this.instance('timber', visualB.x + returnWing.x, 0.62, visualB.z + returnWing.z, returnWidth, 1.18, returnDepth, 0x684b36, wingRotation)
        this.instance(
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
      const lean = this.rotatedOffset(leanSide * (width / 2 + 0.42), -0.2, rotation)
      this.instance('timber', visualB.x + lean.x, 0.5, visualB.z + lean.z, 0.72, 0.92, 1.1, 0x6b4d37, rotation)
      this.instance('cloth', visualB.x + lean.x, 0.98, visualB.z + lean.z, 0.94, 0.08, 1.3, 0x776044, rotation)
    } else if (plot && (profile?.form === 'wide-deep' || plot.id % 3 === 2)) {
      const porch = this.rotatedOffset(doorX * 0.35, depth / 2 + 0.48, rotation)
      this.instance('timber', visualB.x + porch.x, 0.18, visualB.z + porch.z, Math.min(width * 0.65, 2.0), 0.18, 0.72, 0x674a34, rotation)
      const porchHalf = Math.min(0.66, width * 0.2)
      for (const lx of [-porchHalf, porchHalf]) {
        const post = this.rotatedOffset(doorX * 0.35 + lx, depth / 2 + 0.72, rotation)
        this.instance('timber', visualB.x + post.x, 0.66, visualB.z + post.z, 0.09, 1.15, 0.09, 0x4c3628, rotation)
      }
    }

    if (!plot) {
      this.fenceLine(visualB, rotation, -1.55, -0.25, 2.8, false)
      this.fenceLine(visualB, rotation, 0, -1.65, 3.0, true)
      for (let i = 0; i < 4; i++) {
        const log = this.rotatedOffset(-0.9 + i * 0.35, -1.2, rotation)
        this.instance('logs', visualB.x + log.x, 0.2 + (i % 2) * 0.08, visualB.z + log.z, 0.52, 0.52, 0.52, 0x6d4a31, rotation)
      }
    }
  }

  private renderGuardPost(b: Building, rotation: number, color: number, night: number): void {
    this.renderYard(b, rotation, 2.45, 0x5d503d)
    this.instance('stone', b.x, 0.18, b.z, 2.2, 0.36, 2.2, 0x66655f, rotation)
    for (const [lx, lz] of [[-0.82, -0.82], [0.82, -0.82], [-0.82, 0.82], [0.82, 0.82]] as const) {
      const o = this.rotatedOffset(lx, lz, rotation)
      this.instance('timber', b.x + o.x, 1.1, b.z + o.z, 0.18, 2.05, 0.18, 0x503827, rotation)
    }
    this.instance('timber', b.x, 1.54, b.z, 2.45, 0.18, 2.45, 0x68482f, rotation)
    this.instance('gableRoofs', b.x, 1.72, b.z, 2.48, 1.06, 2.15, this.readableNightColor(0x49403a, night), rotation)
    for (const z of [-0.94, 0.94]) {
      const rail = this.rotatedOffset(0, z, rotation)
      this.instance('timber', b.x + rail.x, 1.82, b.z + rail.z, 2.08, 0.09, 0.09, 0x513725, rotation)
    }
    const ladder = this.rotatedOffset(-0.92, 0.12, rotation)
    this.instance('timber', b.x + ladder.x, 0.72, b.z + ladder.z, 0.08, 1.42, 0.08, 0x4e3828, rotation)
    for (let i = 0; i < 4; i++) {
      const rung = this.rotatedOffset(-0.92, -0.08 + i * 0.22, rotation)
      this.instance('timber', b.x + rung.x, 0.28 + i * 0.26, b.z + rung.z, 0.58, 0.07, 0.08, 0x5a402d, rotation)
    }
    const rack = this.rotatedOffset(1.12, 0.32, rotation)
    this.instance('timber', b.x + rack.x, 0.62, b.z + rack.z, 0.12, 1.05, 0.12, 0x503827, rotation)
    for (let i = 0; i < 3; i++) {
      this.instance('metal', b.x + rack.x, 0.72 + i * 0.14, b.z + rack.z, 0.66 - i * 0.08, 0.07, 0.08, i === 0 ? 0x777f84 : 0x626b70, rotation + 0.18)
    }
    const bench = this.rotatedOffset(0.2, 1.25, rotation)
    this.instance('timber', b.x + bench.x, 0.34, b.z + bench.z, 1.0, 0.12, 0.34, 0x65472f, rotation)
    this.frontageClutter(b, rotation, b.id + 17, 0.86)
  }

  private renderTavern(b: Building, rotation: number, color: number, night: number, time: number, activity: number): void {
    this.renderYard(b, rotation, 3.15, 0x6a563d)
    this.timberFrame(b, rotation, 2.92, 2.72, 2.02, color, this.readableNightColor(0x544039, night), 1.28)

    const front = this.rotatedOffset(0.48, 1.43, rotation)
    this.instance('doors', b.x + front.x, 0.86, b.z + front.z, 0.66, 1.48, 0.14, 0x493126, rotation)
    for (const [index, lx] of [-0.78, 0, 0.82].entries()) {
      const win = this.rotatedOffset(lx, 1.47, rotation)
      this.framedWindow(b.x + win.x, 1.35, b.z + win.z, rotation, night, 0.38, 0.5, b.id + index)
    }

    const signPost = this.rotatedOffset(1.55, 1.22, rotation)
    this.instance('timber', b.x + signPost.x, 1.42, b.z + signPost.z, 0.12, 1.7, 0.12, 0x503526, rotation)
    const sign = this.rotatedOffset(1.55, 1.1, rotation)
    this.instance('timber', b.x + sign.x, 1.84, b.z + sign.z, 0.82, 0.62, 0.1, 0x5d3e2c, rotation)
    const signFace = this.rotatedOffset(1.55, 1.16, rotation)
    this.instance('cloth', b.x + signFace.x, 1.84, b.z + signFace.z, 0.64, 0.44, 0.045, TOWN_PALETTE.clothWine, rotation)
    if (night > 0.12) {
      this.instance('glow', b.x + signFace.x, 1.7, b.z + signFace.z, 0.32, 0.26, 0.32, 0xffb766)
    }

    const awning = this.rotatedOffset(-0.55, 1.72, rotation)
    this.instance('cloth', b.x + awning.x, 1.72, b.z + awning.z, 1.65, 0.1, 0.92, 0x865e4d, rotation)

    for (const [lx, lz] of [[-1.2, 1.55], [-0.72, 1.72], [1.0, 1.38]] as const) {
      const barrel = this.rotatedOffset(lx, lz, rotation)
      this.instance('barrels', b.x + barrel.x, 0.37, b.z + barrel.z, 0.45, 0.74, 0.45, this.warmPropColor(0x765031, night, 0.2), rotation)
    }
    for (const lx of [-0.9, 0.4]) {
      const table = this.rotatedOffset(lx, 2.0, rotation)
      this.instance('timber', b.x + table.x, 0.48, b.z + table.z, 0.85, 0.12, 0.52, 0x69472f, rotation)
      this.instance('timber', b.x + table.x, 0.25, b.z + table.z, 0.12, 0.5, 0.12, 0x543826, rotation)
    }

    const sideCanopy = this.rotatedOffset(-1.72, 0.15, rotation)
    this.instance('timber', b.x + sideCanopy.x, 0.78, b.z + sideCanopy.z, 0.12, 1.5, 0.12, 0x513727, rotation)
    const sideAwning = this.rotatedOffset(-1.56, 0.34, rotation)
    this.instance('cloth', b.x + sideAwning.x, 1.28, b.z + sideAwning.z, 1.32, 0.08, 1.4, 0x71434a, rotation)
    this.frontageClutter(b, rotation, b.id + 7, 1.12)
    this.renderCart(b, rotation, 1.85, -0.35, b.id + 3)

    this.renderTavernNightlife(b, rotation, time, activity)
  }

  private renderBrewery(
    b: Building,
    rotation: number,
    color: number,
    time: number,
    night: number,
    productionPhaseActive: boolean,
  ): void {
    this.renderYard(b, rotation, 2.85, 0x645440)
    this.timberFrame(b, rotation, 2.72, 2.58, 1.82, color, this.readableNightColor(0x5a493c, night), 1.08)

    const chimney = this.rotatedOffset(0.86, -0.7, rotation)
    this.instance('stone', b.x + chimney.x, 2.45, b.z + chimney.z, 0.4, 1.75, 0.4, 0x5d5b57, rotation)
    for (const [lx, lz, scale] of [[-1.02, 1.3, 0.5], [-0.48, 1.35, 0.44], [0.2, 1.32, 0.42]] as const) {
      const barrel = this.rotatedOffset(lx, lz, rotation)
      this.instance('barrels', b.x + barrel.x, 0.38, b.z + barrel.z, scale, 0.78, scale, this.warmPropColor(0x745033, night, 0.15), rotation)
    }
    const rack = this.rotatedOffset(-1.3, -0.4, rotation)
    this.instance('timber', b.x + rack.x, 0.62, b.z + rack.z, 0.12, 1.1, 0.12, 0x5a3f2c, rotation)
    for (let i = 0; i < 3; i++) {
      const p = this.rotatedOffset(-1.18, -0.7 + i * 0.34, rotation)
      this.instance('barrels', b.x + p.x, 0.28, b.z + p.z, 0.32, 0.54, 0.32, 0x66472f, rotation)
    }
    const malt = this.rotatedOffset(1.18, -0.35, rotation)
    this.instance('sacks', b.x + malt.x, 0.25, b.z + malt.z, 0.52, 0.62, 0.48, 0x9d895f, rotation)
    const basket = this.rotatedOffset(1.22, 0.1, rotation)
    this.instance('baskets', b.x + basket.x, 0.21, b.z + basket.z, 0.56, 0.72, 0.56, 0x987044, rotation)
    this.frontageClutter(b, rotation, b.id + 11, 1.0)

    const furnace = this.rotatedOffset(0.62, 1.32, rotation)
    const stocked = b.inventory.food > 0 || b.inventory.ale > 0
    this.warmWindow(b.x + furnace.x, 1.08, b.z + furnace.z, rotation, night * (stocked ? 0.62 : 0.24), 0.34, 0.4)

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
        this.instance('smoke', b.x + chimney.x + drift, 3.25 + rise * 1.9, b.z + chimney.z + i * 0.04, 0.5 + rise * 0.5, 0.42 + rise * 0.42, 0.5 + rise * 0.5, night > 0.6 ? 0x59606d : 0x85847f)
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
    this.renderYard(b, rotation, 3.0, 0x584c3d)
    this.timberFrame(b, rotation, 2.72, 2.48, 1.78, color, this.readableNightColor(TOWN_PALETTE.roofDark, night), 1.05)

    const front = this.rotatedOffset(-0.45, 1.26, rotation)
    this.instance('doors', b.x + front.x, 0.78, b.z + front.z, 0.68, 1.4, 0.14, 0x3f322a, rotation)
    const chimney = this.rotatedOffset(0.88, -0.62, rotation)
    this.instance('stone', b.x + chimney.x, 2.48, b.z + chimney.z, 0.46, 1.95, 0.46, 0x505257, rotation)

    const forge = this.rotatedOffset(0.64, 1.36, rotation)
    this.instance('stone', b.x + forge.x, 0.48, b.z + forge.z, 0.9, 0.72, 0.72, 0x575552, rotation)
    const anvil = this.rotatedOffset(-0.76, 1.4, rotation)
    this.instance('metal', b.x + anvil.x, 0.52, b.z + anvil.z, 0.76, 0.2, 0.38, 0x586169, rotation)
    this.instance('timber', b.x + anvil.x, 0.28, b.z + anvil.z, 0.3, 0.56, 0.3, 0x4a3628, rotation)

    const orePile = this.rotatedOffset(1.08, 0.78, rotation)
    for (let i = 0; i < 4; i++) {
      this.instance('ore', b.x + orePile.x + (i % 2) * 0.28, 0.19 + Math.floor(i / 2) * 0.13, b.z + orePile.z + Math.floor(i / 2) * 0.25, 0.4, 0.34, 0.4, 0x68717a, rotation + i)
    }

    const toolRack = this.rotatedOffset(-1.22, 0.18, rotation)
    this.instance('timber', b.x + toolRack.x, 0.6, b.z + toolRack.z, 0.12, 1.15, 0.12, 0x4f3828, rotation)
    for (let i = 0; i < 3; i++) {
      const p = this.rotatedOffset(-1.08, -0.12 + i * 0.28, rotation)
      this.instance('metal', b.x + p.x, 0.58 + i * 0.14, b.z + p.z, 0.52, 0.07, 0.08, 0x70777b, rotation + (i - 1) * 0.2)
    }

    const canopy = this.rotatedOffset(-0.1, 1.72, rotation)
    this.instance('gableRoofs', b.x + canopy.x, 1.18, b.z + canopy.z, 2.72, 0.52, 1.2, this.readableNightColor(0x584638, night), rotation)
    for (const lx of [-1.08, 1.08]) {
      const post = this.rotatedOffset(lx, 1.72, rotation)
      this.instance('timber', b.x + post.x, 0.68, b.z + post.z, 0.1, 1.36, 0.1, 0x493327, rotation)
    }
    const lintel = this.rotatedOffset(-0.1, 1.9, rotation)
    this.instance('timber', b.x + lintel.x, 1.28, b.z + lintel.z, 2.42, 0.12, 0.12, 0x503727, rotation)
    const coal = this.rotatedOffset(1.24, -0.1, rotation)
    for (let i = 0; i < 4; i++) {
      this.instance('ore', b.x + coal.x + (i % 2) * 0.24, 0.12 + Math.floor(i / 2) * 0.1, b.z + coal.z + Math.floor(i / 2) * 0.2, 0.28, 0.24, 0.28, 0x3f4549, rotation + i)
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
      this.instance('glow', b.x + forge.x, 0.82, b.z + forge.z, 0.74 * pulse, 0.32, 0.74 * pulse, 0xff853d)
      this.warmGroundPool(b.x + forge.x, b.z + forge.z, 2.4, 0.38, Math.max(night, 0.42))
      for (let i = 0; i < 2; i++) {
        const drift = Math.sin(time * 1.05 + b.id * 0.5 + i) * 0.16
        const rise = (time * 0.28 + i * 0.5) % 1
        this.instance('smoke', b.x + chimney.x + drift, 3.45 + rise * 1.7, b.z + chimney.z, 0.44 + rise * 0.42, 0.38 + rise * 0.36, 0.44 + rise * 0.42, night > 0.6 ? 0x555e68 : 0x787b7d)
      }
    }
  }

  private renderFortification(b: Building, rotation: number, color: number): void {
    if (b.type === 'wood-wall') {
      // Vertical sharpened palisade stakes replace the old horizontal log-kit look.
      for (const [index, localX] of [-0.4, -0.2, 0, 0.2, 0.4].entries()) {
        const o = this.rotatedOffset(localX, 0, rotation)
        const height = 1.44 + ((b.id + index) % 3) * 0.11
        this.instance('treeTrunk', b.x + o.x, height / 2, b.z + o.z, 0.62, height, 0.62, color, rotation)
        this.instance('wood', b.x + o.x, height + 0.11, b.z + o.z, 0.19, 0.24, 0.19, color, rotation)
      }
      for (const y of [0.52, 0.98]) {
        this.instance('timber', b.x, y, b.z, 0.96, 0.1, 0.11, 0x513927, rotation)
      }
      return
    }

    const left = this.rotatedOffset(-0.36, 0, rotation)
    const right = this.rotatedOffset(0.36, 0, rotation)
    for (const p of [left, right]) {
      this.instance('treeTrunk', b.x + p.x, 0.92, b.z + p.z, 0.72, 1.84, 0.72, color, rotation)
      this.instance('wood', b.x + p.x, 1.9, b.z + p.z, 0.22, 0.28, 0.22, color, rotation)
    }
    for (const y of [0.48, 0.92, 1.36]) {
      this.instance('timber', b.x, y, b.z, 1.16, 0.12, 0.12, 0x493326, rotation)
    }
    this.instance('braceL', b.x - Math.cos(rotation) * 0.16, 0.94, b.z + Math.sin(rotation) * 0.16, 0.72, 0.1, 0.11, 0x5b402e, rotation)
    this.instance('braceR', b.x + Math.cos(rotation) * 0.16, 0.94, b.z - Math.sin(rotation) * 0.16, 0.72, 0.1, 0.11, 0x5b402e, rotation)
    this.instance('metal', b.x, 1.1, b.z, 0.82, 0.08, 0.08, 0x596066, rotation)
  }

  sync(state: WorldState, selectedId: number | null): void {
    for (const mesh of Object.values(this.batches)) mesh.count = 0

    const atmosphere = atmosphereForTime(state.timeOfDay)
    const night = atmosphere.night
    const time = state.elapsedSeconds
    this.updateNightMaterialLift(night)

    for (let i = 0; i < 188; i++) {
      const seed = i * 12.9898 + 4.141
      const x = Math.sin(seed * 1.17) * 30.5 + Math.sin(seed * 0.31) * 1.8
      const z = Math.cos(seed * 0.93) * 30.5 + Math.sin(seed * 0.47) * 1.8
      const sx = 0.85 + (Math.sin(seed * 1.9) * 0.5 + 0.5) * 2.15
      const sz = 0.72 + (Math.cos(seed * 1.41) * 0.5 + 0.5) * 1.72
      this.instance(
        'groundPatch',
        x,
        0.018,
        z,
        sx,
        1,
        sz,
        i % 5 === 0 ? 0x4d6144 : i % 5 === 1 ? 0x64724f : i % 5 === 2 ? 0x57694b : i % 5 === 3 ? 0x6a714e : 0x526348,
        seed * 0.19,
      )
    }

    this.renderVisualRoads(state.roads)

    // Decorative outer woodland extends beyond the playable navigation square so
    // lower cameras see a landscape/forest continuation instead of a board edge.
    for (let i = 0; i < 72; i++) {
      const side = i % 4
      const along = -30 + ((i * 7) % 61)
      const inset = 25.2 + ((i * 11) % 6) * 0.92
      const x = side === 0 ? along : side === 1 ? inset : side === 2 ? along : -inset
      const z = side === 0 ? -inset : side === 1 ? along : side === 2 ? inset : along
      const scale = 0.82 + (i % 7) * 0.045
      const trunkColor = i % 3 === 0 ? 0x493628 : 0x423328
      this.instance('treeTrunk', x, 0.86, z, 0.82 * scale, 1.72 * scale, 0.82 * scale, trunkColor, i * 0.37)
      this.instance('wood', x, 1.82, z, 1.06 * scale, 0.8 * scale, 1.06 * scale, i % 3 === 0 ? 0x314735 : 0x38503a, i * 0.21)
      this.instance('wood', x + Math.sin(i) * 0.15, 2.58, z + Math.cos(i * 0.7) * 0.14, 0.76 * scale, 0.6 * scale, 0.76 * scale, 0x405941, i * 0.29)
      if (i % 2 === 0) {
        this.instance('underbrush', x + Math.sin(i * 1.7) * 0.7, 0.2, z + Math.cos(i * 1.3) * 0.65, 0.68, 0.38, 0.68, 0x496246, i * 0.43)
      }
    }

    for (const n of state.nodes) {
      if (n.remaining <= 0) continue
      if (n.resource === 'wood') {
        const jitterX = Math.sin(n.id * 12.9898) * 0.3
        const jitterZ = Math.cos(n.id * 7.233) * 0.3
        const scale = 0.86 + (n.id % 7) * 0.045
        const trunkX = n.x + jitterX
        const trunkZ = n.z + jitterZ
        this.instance('treeTrunk', trunkX, 0.84, trunkZ, 0.86 * scale, 1.7 * scale, 0.86 * scale, 0x493527, n.id * 0.13)
        this.instance('wood', trunkX, 1.72, trunkZ, 1.08 * scale, 0.78 * scale, 1.08 * scale, n.id % 3 === 0 ? 0x3c553a : 0x344b35, n.id * 0.11)
        this.instance('wood', trunkX + 0.1, 2.42, trunkZ - 0.06, 0.82 * scale, 0.6 * scale, 0.82 * scale, n.id % 4 === 0 ? 0x496044 : 0x3b5239, n.id * 0.19)
        const crownOffset = n.id % 2 === 0 ? 0.28 : -0.24
        this.instance('wood', trunkX + crownOffset, 2.05, trunkZ + 0.16, 0.58 * scale, 0.48 * scale, 0.58 * scale, n.id % 5 === 0 ? 0x465f45 : 0x395139, n.id * 0.31)

        for (let bush = 0; bush < (n.id % 3 === 0 ? 2 : 1); bush++) {
          this.instance(
            'underbrush',
            trunkX + Math.sin(n.id * 0.9 + bush * 2.4) * (0.58 + bush * 0.22),
            0.2,
            trunkZ + Math.cos(n.id * 1.2 + bush * 1.7) * (0.52 + bush * 0.2),
            0.68 - bush * 0.08,
            0.4,
            0.68 - bush * 0.08,
            bush === 0 ? 0x4a6347 : 0x536c4b,
            n.id * 0.29 + bush,
          )
        }
        if (n.id % 7 === 0) {
          this.instance('logs', trunkX + 0.78, 0.16, trunkZ - 0.62, 0.78, 0.65, 0.65, 0x60432f, n.id * 0.17)
        }
        if (night > 0.12) {
          this.instance('treeMoon', trunkX + 0.12, 2.66, trunkZ - 0.12, 0.78 * scale, 0.64 * scale, 0.78 * scale, 0x60758a, n.id * 0.17)
        }
      } else if (n.resource === 'food') {
        const visualX = n.x + Math.sin(n.id * 1.93) * 0.34
        const visualZ = n.z + Math.cos(n.id * 1.57) * 0.34
        const scale = 0.78 + (n.id % 5) * 0.075
        this.instance('food', visualX, 0.42 * scale, visualZ, scale, scale, scale, night > 0.45 ? 0x829b65 : undefined, n.id * 0.21)
        if (n.id % 3 !== 1) {
          this.instance('underbrush', visualX + 0.42, 0.13, visualZ - 0.28, 0.34, 0.24, 0.34, 0x516848, n.id * 0.33)
        }
        if (n.id % 4 === 0) {
          this.instance('underbrush', visualX - 0.36, 0.11, visualZ + 0.31, 0.26, 0.2, 0.26, 0x5a704e, n.id * 0.41)
        }
      } else if (n.resource === 'ore') {
        this.instance('ore', n.x, 0.42, n.z, 1.05, 0.78, 1.05, night > 0.45 ? 0x657487 : undefined, n.id * 0.31)
        this.instance('ore', n.x + 0.38, 0.24, n.z - 0.24, 0.58, 0.46, 0.58, 0x5d6570, n.id * 0.53)
      }
    }

    for (const a of state.settlers) {
      const hit = this.recentlyHit(a.lastHitTick, state.tick)
      const color = hit ? 0xa9524a : a.health <= 0 ? 0x555555 : undefined
      const facing = a.path.length ? Math.atan2(a.path[0].x - a.x, a.path[0].z - a.z) : (a.id % 8) * Math.PI / 4
      this.renderAdultFigure(a.x, a.z, a.id, a.role === 'guard', time, color, facing)
      this.healthBar(a.x, 1.62, a.z, a.health, a.maxHealth, 0.8)

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
      const plot = b.type === 'house' ? state.residentialPlots.find(candidate => candidate.buildingId === b.id) : undefined
      const rotation = plot?.angle ?? b.facingAngle ?? (b.rotation ?? 0) * Math.PI / 2
      const damage = damageVisualStage(b.health, b.maxHealth, b.destroyed)
      const intactColor = this.damagedColor(def.color, damage)
      const baseColor = hit ? 0xff705e : this.readableNightColor(intactColor, night)

      if (plot) this.renderResidentialPlot(plot, b, night, state.residentialPlots)

      if ((b.complete || b.work > 0) && !plot) {
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
        this.renderYard(b, rotation, 1.75, 0x5e503a)
        for (let i = 0; i < 8; i++) {
          const a = i / 8 * Math.PI * 2
          this.instance('stone', b.x + Math.sin(a) * 0.5, 0.12, b.z + Math.cos(a) * 0.5, 0.28, 0.2, 0.28, 0x68645b, a)
        }
        this.instance('logs', b.x, 0.26, b.z, 0.9, 0.9, 0.9, 0x5a3b28, Math.PI / 4)
        this.instance('logs', b.x, 0.27, b.z, 0.9, 0.9, 0.9, 0x5a3b28, -Math.PI / 4)
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
        this.renderHouse(b, rotation, baseColor, occupiedNight, plot)
        if (occupiedHomes.has(b.id)) {
          const houseLight = this.rotatedOffset(0, 1.15, rotation)
          this.warmGroundPool(b.x + houseLight.x, b.z + houseLight.z, 4.15, 0.34, occupiedNight)
          glowX += b.x + houseLight.x * 0.35
          glowZ += b.z
          glowWeight++
        }
      } else if (b.type === 'guard-post') {
        this.renderGuardPost(b, rotation, baseColor, night)
      } else if (b.type === 'tavern') {
        const serviceNight = b.inventory.ale > 0 ? night : night * 0.35
        const activity = state.enemies.length === 0 ? Math.max(atmosphere.twilight, night * 0.46) : 0
        this.renderTavern(b, rotation, baseColor, serviceNight, time, activity)
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
    const radius = this.mode === 'follow' ? 9 : this.cinematic ? Math.min(this.zoom, 24) : this.zoom
    const horizontal = this.mode === 'follow' ? 0.74 : this.cinematic ? 0.96 : 0.82
    const height = this.mode === 'follow' ? 0.72 : this.cinematic ? 0.4 : 0.62
    this.camera.position.set(
      this.focus.x + Math.sin(this.angle) * radius * horizontal,
      radius * height,
      this.focus.z + Math.cos(this.angle) * radius * horizontal,
    )
    this.camera.lookAt(this.focus.x, this.cinematic && this.mode === 'settlement' ? 1.0 : 0.45, this.focus.z)
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
    facingAngle: number | null = null,
  ): void {
    this.ghost.visible = false
    this.ghostLine.visible = false
    this.ghostLine.count = 0
    this.facing.visible = false
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
      this.facing.scale.set(0.82, 0.09, 0.18)
    }
  }

  showRoadGhost(points: Point[], valid: boolean, showGrid = false, width = 1.7): void {
    this.ghost.visible = false
    this.ghostLine.visible = false
    this.ghostLine.count = 0
    this.facing.visible = false
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

  showResidentialPlotGhost(preview: ResidentialPlotPreview | null, valid: boolean, showGrid = false): void {
    this.ghost.visible = false
    this.ghostLine.visible = false
    this.ghostLine.count = 0
    this.facing.visible = false
    this.grid.visible = showGrid
    if (!preview) return

    const color = new THREE.Color(valid ? 0x9bc07b : 0xef6d65)
    const markerColor = new THREE.Color(preview.adjacentSnapped && valid ? 0xf1c86f : (valid ? 0xd7e8a7 : 0xef6d65))
    this.ghost.visible = true
    this.ghost.position.set(preview.center.x, 0.045, preview.center.z)
    this.ghost.rotation.set(0, preview.angle, 0)
    this.ghost.scale.set(Math.max(0.1, preview.width), 0.07, Math.max(0.1, preview.depth))
    ;(this.ghost.material as THREE.MeshBasicMaterial).color.copy(color)

    const frontMid = {
      x: (preview.frontageA.x + preview.frontageB.x) / 2,
      z: (preview.frontageA.z + preview.frontageB.z) / 2,
    }
    this.facing.visible = true
    this.facing.position.set(frontMid.x, 0.09, frontMid.z)
    this.facing.rotation.set(0, preview.angle, 0)
    this.facing.scale.set(Math.min(1.1, Math.max(0.72, preview.width * 0.18)), 0.09, 0.2)

    const dx = preview.frontageB.x - preview.frontageA.x
    const dz = preview.frontageB.z - preview.frontageA.z
    const frontageLength = Math.max(0.001, Math.hypot(dx, dz))
    const tx = dx / frontageLength
    const tz = dz / frontageLength
    const markerCount = Math.min(12, Math.max(2, Math.floor(preview.width) + 1))
    this.ghostLine.visible = true
    this.ghostLine.count = markerCount
    for (let i = 0; i < markerCount; i++) {
      const t = markerCount === 1 ? 0 : i / (markerCount - 1)
      const x = preview.frontageA.x + tx * frontageLength * t
      const z = preview.frontageA.z + tz * frontageLength * t
      this.matrix.position.set(x, 0.075, z)
      this.matrix.scale.set(0.055, 0.075, i === 0 || i === markerCount - 1 ? 0.62 : 0.4)
      this.matrix.rotation.set(0, preview.angle, 0)
      this.matrix.updateMatrix()
      this.ghostLine.setMatrixAt(i, this.matrix.matrix)
      this.ghostLine.setColorAt(i, markerColor)
    }
    this.ghostLine.instanceMatrix.needsUpdate = true
    if (this.ghostLine.instanceColor) this.ghostLine.instanceColor.needsUpdate = true
  }

  worldPointPrecise(clientX: number, clientY: number): Point | null {
    const rect = this.canvas.getBoundingClientRect()
    this.ray.setFromCamera(
      new THREE.Vector2(
        (clientX - rect.left) / rect.width * 2 - 1,
        -(clientY - rect.top) / rect.height * 2 + 1,
      ),
      this.camera,
    )
    const hit = this.ray.ray.intersectPlane(this.groundPlane, new THREE.Vector3())
    return hit ? { x: hit.x, z: hit.z } : null
  }

  worldPoint(clientX: number, clientY: number): Point | null {
    const hit = this.worldPointPrecise(clientX, clientY)
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
