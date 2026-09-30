import { RegionalBackdrop } from './RegionalBackdrop'
import * as THREE from 'three'
import { BUILDINGS, type BuildingId, type BuildingDefinition } from '../data/buildings'
import { RESOURCE_IDS, RESOURCES } from '../data/resources'
import { MAP_SIZE } from '../world/Navigation'
import { raiderArchetype } from '../systems/combat/Raid'
import { settlementTier } from '../systems/progression/TownProgression'
import { plotCorners, residentialPlotWidth, type ResidentialPlotPreview } from '../world/TownPlanning'
import type { Building, FieldPlot, Job, Point, ResidentialPlot, WorldState } from '../model/WorldState'
import { atmosphereForTime, constructionVisualStage, damageVisualStage, type DamageVisualStage } from './VisualState'
import { residentialPresentationProfile, type ResidentialPresentationProfile } from './ResidentialPresentation'
import { TOWN_PALETTE } from './TownPresentation'
import { RoadTerrain } from './RoadTerrain'
import { roadCoverageAt, ROAD_GRASS_LIMIT, ROAD_STONE_LIMIT } from './RoadSurface'
import { createCartWheelGeometry, createGableRoofGeometry, createRadialGlowTexture, createRoofCourseGeometry } from './RenderPrimitives'
import { PlacementGhostRenderer } from './PlacementGhostRenderer'
import { FieldRenderer } from './FieldRenderer'
import { PlanningOverlayRenderer } from './PlanningOverlayRenderer'
import { TownBuildingRenderer } from './TownBuildingRenderer'
import { TreeRenderer } from './TreeRenderer'
import { activeWoodTreePoint } from '../systems/economy/Woodcutting'

export type CameraMode = 'settlement' | 'follow'

export class SceneRenderer {
  overflowInstances = 0
  readonly canvas = document.createElement('canvas')
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1600)
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
  private readonly regionBackdrop = new RegionalBackdrop()
  private readonly ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.groundMaterial)
  private regionSize = 47
  private readonly roadTerrain = new RoadTerrain(MAP_SIZE + 20)
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
    'treeBole', 'treeBranch', 'treeCrown', 'treeStump', 'treeCut', 'treeLog', 'axeHandle', 'axeHead',
    'draftOxBody', 'draftOxHead', 'draftOxLeg', 'draftOxHorn', 'draftYoke',
    'foundation', 'scaffold', 'debris',
  ])
  private readonly geometry = new THREE.BoxGeometry(1, 1, 1)
  private readonly selection: THREE.LineSegments
  private readonly paths: THREE.LineSegments
  private readonly placementGhosts: PlacementGhostRenderer
  private readonly fieldRenderer: FieldRenderer
  private readonly planningOverlays: PlanningOverlayRenderer
  private readonly townRenderer: TownBuildingRenderer
  private readonly treeRenderer: TreeRenderer
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

  constructor(agentCapacity = 10) {
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
    this.scene.add(this.sun, this.sun.target, this.moon, this.ambient, this.settlementGlow)

    const ground = this.ground
    ground.scale.set(MAP_SIZE + 20, MAP_SIZE + 20, 1)
    this.scene.add(this.regionBackdrop)
    this.groundMaterial.map = this.roadTerrain.texture
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    this.scene.add(ground)

    this.grid.position.y = 0.012
    ;(this.grid.material as THREE.Material).transparent = true
    ;(this.grid.material as THREE.Material).opacity = 0.22
    this.grid.visible = false
    this.scene.add(this.grid)

    this.placementGhosts = new PlacementGhostRenderer(
      this.scene,
      this.grid,
      this.geometry,
      (x, z, angle) => this.rotatedOffset(x, z, angle),
    )
    this.fieldRenderer = new FieldRenderer(
      this.scene,
      (name, x, y, z, sx, sy, sz, color, rotation) => this.instance(name, x, y, z, sx, sy, sz, color, rotation),
    )
    this.planningOverlays = new PlanningOverlayRenderer(
      (name, x, y, z, sx, sy, sz, color, rotation) => this.instance(name, x, y, z, sx, sy, sz, color, rotation),
      (x, z, angle) => this.rotatedOffset(x, z, angle),
    )
    this.townRenderer = new TownBuildingRenderer(
      (name, x, y, z, sx, sy, sz, color, rotation) => this.instance(name, x, y, z, sx, sy, sz, color, rotation),
      (x, z, angle) => this.rotatedOffset(x, z, angle),
      this.planningOverlays,
    )

    this.treeRenderer = new TreeRenderer(
      (name, x, y, z, sx, sy, sz, color, yaw, pitch, roll) =>
        this.instance(name, x, y, z, sx, sy, sz, color, yaw, pitch, roll),
    )

    this.addBatch('regionalCrown', new THREE.IcosahedronGeometry(1, 1), 0x465d39, 8192)
    this.addBatch('regionalTrunk', new THREE.CylinderGeometry(0.18, 0.3, 1, 5), 0x51402d, 4096)
    ;(this.batches.regionalCrown.material as THREE.MeshStandardMaterial).color.setHex(0xffffff)
    ;(this.batches.regionalTrunk.material as THREE.MeshStandardMaterial).color.setHex(0xffffff)
    this.addBatch('wood', new THREE.ConeGeometry(0.65, 2.8, 7), 0x354d36, 1600)
    this.addBatch('treeTrunk', new THREE.CylinderGeometry(0.14, 0.2, 1, 7), 0x4e3828, 1000)
    this.addBatch('underbrush', new THREE.DodecahedronGeometry(0.45, 0), 0x496246, 1300)
    this.addBatch('treeBole', new THREE.CylinderGeometry(0.13, 0.24, 1, 9), 0x503a2a, 14000)
    this.addBatch('treeBranch', new THREE.CylinderGeometry(0.035, 0.08, 1, 7), 0x503a2a, 18000)
    this.addBatch('treeCrown', new THREE.DodecahedronGeometry(0.66, 1), 0x40593a, 22000)
    this.addBatch('treeStump', new THREE.CylinderGeometry(0.2, 0.27, 0.46, 9), 0x503a2a, 12000)
    this.addBatch('treeCut', new THREE.CylinderGeometry(0.2, 0.2, 0.08, 9), 0xc59662, 9000)
    this.addBatch('treeChip', new THREE.TetrahedronGeometry(0.09, 0), 0xb8804c, 5000)
    this.addBatch('treeLog', new THREE.CylinderGeometry(0.16, 0.21, 1, 9).rotateZ(Math.PI / 2), 0x5b402d, 3200)
    this.addBatch('axeHandle', new THREE.CylinderGeometry(0.024, 0.031, 1, 6), 0x6a472f, Math.max(80, agentCapacity * 2))
    this.addBatch('axeHead', new THREE.BoxGeometry(0.3, 0.11, 0.075), 0x707980, Math.max(80, agentCapacity * 2))
    this.addBatch('draftOxBody', new THREE.CapsuleGeometry(0.28, 0.62, 3, 7).rotateX(Math.PI / 2), 0x72543b, Math.max(40, agentCapacity))
    this.addBatch('draftOxHead', new THREE.BoxGeometry(0.42, 0.38, 0.5), 0x684a34, Math.max(40, agentCapacity))
    this.addBatch('draftOxLeg', new THREE.CylinderGeometry(0.055, 0.065, 0.48, 6), 0x4c382b, Math.max(160, agentCapacity * 4))
    this.addBatch('draftOxHorn', new THREE.ConeGeometry(0.06, 0.3, 6).rotateZ(Math.PI / 2), 0xd0c19a, Math.max(80, agentCapacity * 2))
    this.addBatch('draftYoke', new THREE.BoxGeometry(1, 1, 1), 0x5a3e2a, Math.max(40, agentCapacity))
    this.addBasicBatch('treeMoon', new THREE.ConeGeometry(0.72, 1.35, 7), 0x60758a, 1000, 0.2)
    this.addBatch('food', new THREE.DodecahedronGeometry(0.65, 0), 0x91a95d, 1000)
    this.addBatch('ore', new THREE.DodecahedronGeometry(0.58, 0), 0x737b86, Math.max(360, agentCapacity))
    this.addBasicBatch('roadShoulder', new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), 0xa18d69, 1200, 0.12)
    this.addBasicBatch('roadCobble', new THREE.BoxGeometry(1, 1, 1), 0x77736b, 5200, 0.86)
    this.addBasicBatch('roadStone', new THREE.DodecahedronGeometry(0.12, 0), 0x70695f, ROAD_STONE_LIMIT)
    this.addBatch('roadGrass', new THREE.ConeGeometry(0.11, 0.22, 3), 0x64734d, ROAD_GRASS_LIMIT)
    this.addBasicBatch('plotGround', new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), 0x675940, 160, 0.035)
    this.addBasicBatch('planningFill', new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), 0xb8ae82, 240, 0.1)
    this.addBasicBatch('planningGuide', this.geometry, 0xe8dfc4, 1800, 0.72)
    this.addBasicBatch('planningMarker', new THREE.RingGeometry(0.18, 0.28, 14).rotateX(-Math.PI / 2), 0xe8dfc4, 480, 0.82)
    this.addBasicBatch('fieldFurrow', new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), 0x6b573f, 4200, 0.34)
    this.addBatch('fieldCrop', new THREE.ConeGeometry(0.13, 0.4, 5), 0x70804b, 7200)
    this.addBatch('fieldEdgeGrass', new THREE.BoxGeometry(1, 0.04, 0.18), 0x748356, 2200)
    this.addBasicBatch('fieldSoilPatch', new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2), 0x80664a, 1800, 0.16)
    this.addBasicBatch('yardPatch', new THREE.CircleGeometry(1, 18).rotateX(-Math.PI / 2), 0x66563f, 320, 0.28)
    this.addBatch('gardenRow', new THREE.BoxGeometry(1, 0.08, 1), 0x5f6941, 420)
    this.addBatch('chicken', new THREE.SphereGeometry(0.16, 6, 4), 0xb9a477, 160)
    this.addBatch('stone', this.geometry, TOWN_PALETTE.stone, 1200)
    this.addBatch('plaster', this.geometry, TOWN_PALETTE.plasterWarm, 700)
    this.addBatch('timber', this.geometry, TOWN_PALETTE.timberDark, 2600 + 2 * Math.max(0, agentCapacity - 10))
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
    this.addBatch('adultTorso', new THREE.CapsuleGeometry(0.2, 0.34, 3, 6), 0x8b6a51, agentCapacity + 90)
    this.addBatch('adultSkirt', new THREE.ConeGeometry(0.32, 0.65, 8), 0x77535a, agentCapacity + 90)
    this.addBatch('adultHead', new THREE.SphereGeometry(0.18, 8, 6), 0xd6ad8b, agentCapacity + 110)
    this.addBatch('adultHair', new THREE.SphereGeometry(0.19, 8, 6), 0x4a3528, agentCapacity + 110)
    this.addBatch('adultHairLong', new THREE.CapsuleGeometry(0.16, 0.38, 3, 6), 0x4a3528, agentCapacity + 70)
    this.addBatch('adultArm', new THREE.CapsuleGeometry(0.055, 0.34, 2, 5), 0xd6ad8b, 2 * agentCapacity + 200)
    this.addBatch('adultLeg', new THREE.CapsuleGeometry(0.075, 0.35, 2, 5), 0x463a32, 2 * agentCapacity + 140)
    this.addBatch('adultBodice', new THREE.CapsuleGeometry(0.19, 0.22, 3, 6), TOWN_PALETTE.clothWine, agentCapacity + 70)
    this.addBatch('guardCoat', new THREE.CapsuleGeometry(0.23, 0.38, 3, 6), 0x6a5149, agentCapacity + 20)
    this.addBatch('entertainer', new THREE.ConeGeometry(0.34, 0.78, 10), TOWN_PALETTE.clothWine, 40)
    this.addBatch('settlers', new THREE.CapsuleGeometry(0.22, 0.45, 3, 5), 0xe6ce9c, agentCapacity)
    this.addBatch('guards', new THREE.CapsuleGeometry(0.24, 0.5, 3, 5), 0xa96f52, agentCapacity)
    this.addBatch('enemies', new THREE.CapsuleGeometry(0.26, 0.5, 3, 5), 0x6f2525, 64)
    this.addBatch('cargo', this.geometry, 0xffffff, agentCapacity)
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
    this.addBatch('healthBack', this.geometry, 0x2b211f, agentCapacity + 246)
    this.addBatch('healthFill', this.geometry, 0x76b56e, agentCapacity + 246)

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
    const noCastShadow = ['treeMoon', 'campfireCore', 'windowHalo', 'windowGlow', 'warmPool', 'campfirePool', 'glow', 'smoke', 'groundWear', 'roadShoulder', 'roadCobble', 'roadGrass', 'roadStone', 'plotGround', 'planningFill', 'planningGuide', 'planningMarker', 'fieldFurrow', 'fieldCrop', 'fieldEdgeGrass', 'fieldSoilPatch', 'yardPatch', 'gableRoofs']
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
    sx = 1, sy = 1, sz = 1, color?: number, rotation = 0, pitch = 0, roll = 0,
  ): void {
    // Decorative resource undergrowth may encroach on shoulders, but not cover
    // the worn corridor. Resource trunks/bushes themselves remain inspectable.
    if (name === 'underbrush' && this.roadTerrain.surface
      && roadCoverageAt(this.roadTerrain.surface, x, z) > 0.4) return
    const mesh = this.batches[name]
    const i = mesh.count
    if (i >= mesh.instanceMatrix.count) { this.overflowInstances++; return }
    mesh.count++
    this.matrix.position.set(x, y, z)
    this.matrix.scale.set(sx, sy, sz)
    this.matrix.rotation.set(pitch, rotation, roll)
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
    const cost = RESOURCE_IDS.reduce((sum, resource) => sum + def.buildCost[resource], 0)
    const delivered = RESOURCE_IDS.reduce((sum, resource) => sum + b.delivered[resource], 0)
    const materialRatio = Math.min(1, delivered / Math.max(1, cost))
    const workRatio = Math.min(1, b.work / Math.max(0.01, def.constructionWork))
    const size = def.fortification ? 0.9 : Math.max(1, def.footprint * 0.86)
    const half = def.fortification ? 0.32 : Math.max(0.35, def.footprint * 0.34)

    // Delivered material remains visibly staged beside the footprint until completion.
    const pileCount = Math.min(5, Math.ceil(materialRatio * 5))
    for (let i = 0; i < pileCount; i++) {
      const lane = this.rotatedOffset(-half + i * Math.max(0.28, half * 0.36), half + 0.62, rotation)
      this.instance('logs', b.x + lane.x, 0.18 + (i % 2) * 0.07, b.z + lane.z, 0.58, 0.48, 0.58, 0x6d4a31, rotation + (i % 2) * Math.PI / 2)
    }

    // Survey stakes make a fresh blueprint read as a real work site before the first hammer swing.
    if (stage === 'site') {
      for (const [lx, lz] of [[-half, -half], [half, -half], [-half, half], [half, half]] as const) {
        const o = this.rotatedOffset(lx, lz, rotation)
        this.instance('scaffold', b.x + o.x, 0.22, b.z + o.z, 0.07, 0.44, 0.07, 0x7d6043, rotation)
      }
      return
    }

    // Foundation grows first instead of appearing at full strength instantly.
    const foundationScale = Math.max(0.2, Math.min(1, workRatio / 0.2))
    this.instance('foundation', b.x, 0.07, b.z, size * foundationScale, 0.14, size, 0x746b57, rotation)
    if (stage === 'foundation') return

    const frameProgress = Math.max(0, Math.min(1, (workRatio - 0.2) / 0.25))
    const postHeight = 0.7 + frameProgress * 1.25
    for (const [lx, lz] of [[-half, -half], [half, -half], [-half, half], [half, half]] as const) {
      const o = this.rotatedOffset(lx, lz, rotation)
      this.instance('scaffold', b.x + o.x, postHeight / 2, b.z + o.z, 0.12, postHeight, 0.12, 0x815d3e, rotation)
    }
    this.instance('scaffold', b.x, postHeight, b.z, Math.max(0.7, half * 2.25), 0.12, 0.12, 0x8b6542, rotation)
    this.instance('scaffold', b.x, postHeight, b.z, 0.12, 0.12, Math.max(0.7, half * 2.25), 0x8b6542, rotation)
    if (stage === 'frame') return

    // Exterior scaffolding grows upward as the crew advances through this stage.
    const scaffoldProgress = Math.max(0, Math.min(1, (workRatio - 0.45) / 0.2))
    const fullScaffoldHeight = def.fortification ? 1.15 : 2.15
    const scaffoldHeight = fullScaffoldHeight * (0.3 + scaffoldProgress * 0.7)
    for (const side of [-1, 1] as const) {
      const a = this.rotatedOffset(side * (half + 0.36), 0, rotation)
      this.instance('scaffold', b.x + a.x, scaffoldHeight / 2, b.z + a.z, 0.08, scaffoldHeight, 0.08, 0x9b7750, rotation)
      const bSide = this.rotatedOffset(0, side * (half + 0.36), rotation)
      this.instance('scaffold', b.x + bSide.x, scaffoldHeight / 2, b.z + bSide.z, 0.08, scaffoldHeight, 0.08, 0x9b7750, rotation)
    }
    const scaffoldDeckY = Math.max(0.25, scaffoldHeight * 0.55)
    this.instance('scaffold', b.x, scaffoldDeckY, b.z, Math.max(0.8, half * 2.65), 0.08, 0.08, 0xa07a4f, rotation)
    if (stage === 'scaffold') return

    const shellProgress = Math.max(0.18, Math.min(1, (workRatio - 0.65) / 0.2))
    const shellHeight = (def.fortification ? 1.15 : 1.7) * shellProgress
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
    if (stage === 'shell') return

    // Final work visibly closes the roof while scaffolds remain until completion.
    if (!def.fortification) {
      const roofProgress = Math.max(0.15, Math.min(1, (workRatio - 0.85) / 0.15))
      this.instance(
        'gableRoofs',
        b.x,
        1.58 + roofProgress * 0.25,
        b.z,
        Math.max(1.15, def.footprint * 0.74) * roofProgress,
        0.72,
        Math.max(1.15, def.footprint * 0.74),
        0x5b4b40,
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

  private renderRoadDressing(): void {
    const surface = this.roadTerrain.surface
    if (!surface) return
    for (const p of surface.grass) {
      this.instance('roadGrass', p.x, 0.065 * p.scale, p.z, p.scale, p.scale * 0.6, p.scale, 0x64734d, p.angle)
    }
    for (const p of surface.stones) {
      this.instance('roadStone', p.x, 0.035, p.z, p.scale * 0.55, p.scale * 0.28, p.scale * 0.7, 0x777468, p.angle)
    }
  }

  private renderTownRoadEvolution(state: WorldState, tierRank: number): void {
    if (tierRank < 3) return
    let budget = tierRank >= 4 ? 3000 : 1900
    for (const road of state.roads) {
      for (let i = 1; i < road.points.length && budget > 0; i++) {
        const a = road.points[i - 1]
        const b = road.points[i]
        const dx = b.x - a.x
        const dz = b.z - a.z
        const length = Math.hypot(dx, dz)
        if (length < 0.1) continue
        const angle = Math.atan2(dx, dz)
        const steps = Math.max(1, Math.floor(length / 0.72))
        const nx = -dz / length
        const nz = dx / length
        const lanes = tierRank >= 4 ? [-0.52, 0, 0.52] : [-0.38, 0.38]
        for (let step = 0; step <= steps && budget > 0; step++) {
          const t = step / steps
          for (const lane of lanes) {
            if (budget-- <= 0) break
            const jitter = ((road.id + i * 13 + step * 7) % 5 - 2) * 0.035
            const x = a.x + dx * t + nx * (lane * Math.min(1.4, road.width / 2) + jitter)
            const z = a.z + dz * t + nz * (lane * Math.min(1.4, road.width / 2) - jitter)
            const shade = (road.id + step + Math.round(lane * 10)) % 3
            this.instance('roadCobble', x, 0.045, z, 0.46, 0.06, 0.62, shade === 0 ? 0x77736b : shade === 1 ? 0x6c6963 : 0x817c72, angle)
          }
        }
      }
    }
  }
  sync(state: WorldState, selectedId: number | null): void {
    this.overflowInstances = 0
    for (const mesh of Object.values(this.batches)) mesh.count = 0

    const atmosphere = atmosphereForTime(state.timeOfDay)
    const night = atmosphere.night
    const time = state.elapsedSeconds
    const town = settlementTier(state)
    this.updateNightMaterialLift(night)

    this.regionSize = state.map?.size ?? 47
    this.sun.position.set(this.focus.x - 20, 40, this.focus.z + 20)
    this.sun.target.position.set(this.focus.x, 0, this.focus.z)
    this.sun.castShadow = this.zoom < 150
    this.ground.scale.set(this.regionSize + 20, this.regionSize + 20, 1)
    this.regionBackdrop.update(state.map)
    this.grid.position.x = Math.round(this.focus.x); this.grid.position.z = Math.round(this.focus.z)
    this.roadTerrain.update(state.roads, state.map)
    this.renderRoadDressing()
    this.renderTownRoadEvolution(state, town.rank)
    this.fieldRenderer.render(state.fields)

    // Decorative outer woodland extends beyond the playable navigation square so
    // lower cameras see a landscape/forest continuation instead of a board edge.
    for (let i = 0; !state.map && i < 72; i++) {
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

    const woodJobs = new Map<number, Job>()
    for (const job of state.jobs) {
      if (job.kind === 'gather' && job.resource === 'wood') woodJobs.set(job.sourceId, job)
    }

    for (const n of state.nodes) {
      if (state.map && (n.x - this.focus.x) ** 2 + (n.z - this.focus.z) ** 2 > Math.max(90, this.zoom * 1.6) ** 2) continue
      if (n.resource === 'wood') {
        const far = !!state.map && (Math.hypot(n.x - this.focus.x, n.z - this.focus.z) > 80 || this.zoom > 150)
        this.treeRenderer.renderNode(n, woodJobs.get(n.id), {
          regional: !!state.map,
          far,
          night,
          time,
        })
        continue
      }
      if (n.remaining <= 0) continue
      if (n.resource === 'food') {
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
      const activeJob = a.jobId === null ? undefined : state.jobs.find(job => job.id === a.jobId)
      const buildTarget = activeJob?.kind === 'construct' && activeJob.stage === 'work'
        ? state.buildings.find(building => building.id === activeJob.targetId)
        : undefined
      const woodNode = activeJob?.kind === 'gather' && activeJob.resource === 'wood' && activeJob.stage === 'work'
        ? state.nodes.find(node => node.id === activeJob.sourceId)
        : undefined
      const woodTarget = woodNode ? activeWoodTreePoint(woodNode) : undefined
      const haulingTimber = !!activeJob && activeJob.kind === 'gather' && activeJob.resource === 'wood' && activeJob.stage === 'target'
      const facing = buildTarget
        ? Math.atan2(buildTarget.x - a.x, buildTarget.z - a.z)
        : woodTarget
          ? Math.atan2(woodTarget.x - a.x, woodTarget.z - a.z)
          : a.path.length
            ? Math.atan2(a.path[0].x - a.x, a.path[0].z - a.z)
            : (a.id % 8) * Math.PI / 4
      this.townRenderer.renderAdultFigure(a.x, a.z, a.id, a.role === 'guard', time, color, facing)
      if (woodNode && activeJob) this.treeRenderer.renderWoodcutter(a, woodNode, activeJob, time)
      if (haulingTimber && activeJob) this.treeRenderer.renderTimberHaul(a, activeJob, time, facing)
      this.healthBar(a.x, 1.62, a.z, a.health, a.maxHealth, 0.8)

      const resource = RESOURCE_IDS.find(resource => a.cargo[resource] > 0) ?? null
      if (resource && !(haulingTimber && resource === 'wood')) {
        this.instance('cargo', a.x + 0.28, 0.85, a.z, 0.38, 0.38, 0.38, RESOURCES[resource].color)
      }

      if (buildTarget) {
        const hammerLift = 0.08 + (Math.sin(time * 9 + a.id * 0.7) + 1) * 0.09
        const tool = this.rotatedOffset(0.34, 0.05, facing)
        this.instance('timber', a.x + tool.x, 0.82 + hammerLift, a.z + tool.z, 0.055, 0.52, 0.055, 0x5c3d28, facing)
        this.instance('metal', a.x + tool.x, 1.08 + hammerLift, a.z + tool.z, 0.28, 0.08, 0.11, 0x777b7d, facing)
      }
    }

    for (const remains of state.remains) {
      if (remains.heavy) {
        this.instance('logs', remains.x, 0.24, remains.z, 1.7, 0.68, 0.68, 0x4a3528, Math.PI / 2 + remains.id * 0.11)
        this.instance('cartWheel', remains.x - 0.48, 0.18, remains.z + 0.32, 0.56, 0.56, 0.56, 0x342820, remains.id * 0.17)
        this.instance('cartWheel', remains.x + 0.48, 0.18, remains.z - 0.28, 0.56, 0.56, 0.56, 0x342820, remains.id * 0.21)
        this.instance('debris', remains.x + 0.18, 0.12, remains.z + 0.18, 0.72, 0.18, 0.38, 0x40362e, remains.id * 0.31)
      } else {
        this.instance('debris', remains.x, 0.08, remains.z, 0.78, 0.12, 0.34, 0x40332f, remains.id * 0.23)
        this.instance('cloth', remains.x + 0.12, 0.09, remains.z - 0.1, 0.52, 0.06, 0.26, 0x5b2d34, remains.id * 0.19)
      }
    }

    for (const e of state.enemies) {
      const archetype = raiderArchetype(e)
      const hit = this.recentlyHit(e.lastHitTick, state.tick)
      const facing = e.path.length ? Math.atan2(e.path[0].x - e.x, e.path[0].z - e.z) : (e.id % 8) * Math.PI / 4
      const scale = archetype === 'brute' ? 1.34 : archetype === 'skirmisher' ? 0.84 : 1
      const baseColor = archetype === 'brute' ? 0x552b2d : archetype === 'skirmisher' ? 0x9b4d3d : 0x6f2525
      const color = hit ? 0xff6558 : e.health <= e.maxHealth * 0.5 ? 0x8f3333 : baseColor

      if (archetype === 'ram') {
        // A low, heavy wheeled timber frame reads very differently from foot raiders.
        const forward = this.rotatedOffset(0, 0.2, facing)
        this.instance('logs', e.x + forward.x, 0.66, e.z + forward.z, 2.35, 1.25, 1.25, hit ? 0xff6558 : 0x60432f, facing + Math.PI / 2)
        for (const side of [-0.62, 0.62]) {
          const leftWheel = this.rotatedOffset(side, -0.65, facing)
          const rightWheel = this.rotatedOffset(side, 0.72, facing)
          this.instance('cartWheel', e.x + leftWheel.x, 0.38, e.z + leftWheel.z, 0.72, 0.72, 0.72, 0x3d2b22, facing)
          this.instance('cartWheel', e.x + rightWheel.x, 0.38, e.z + rightWheel.z, 0.72, 0.72, 0.72, 0x3d2b22, facing)
        }
        const roof = this.rotatedOffset(0, 0.05, facing)
        this.instance('timber', e.x + roof.x, 1.2, e.z + roof.z, 1.65, 0.12, 2.35, 0x4b372a, facing)
      } else {
        this.instance('enemies', e.x, 0.56 * scale, e.z, scale, scale, scale, color)

        const hand = this.rotatedOffset(0.3 * scale, 0.08, facing)
        if (archetype === 'brute') {
          this.instance('timber', e.x + hand.x, 0.72 * scale, e.z + hand.z, 0.15, 0.95 * scale, 0.15, 0x4c3224, facing)
        } else {
          this.instance('metal', e.x + hand.x, 0.7 * scale, e.z + hand.z, 0.07, 0.58 * scale, 0.08, archetype === 'skirmisher' ? 0x8e969a : 0x73797d, facing)
        }
        if (archetype === 'raider') {
          const shield = this.rotatedOffset(-0.27, 0.04, facing)
          this.instance('props', e.x + shield.x, 0.72, e.z + shield.z, 0.42, 0.54, 0.1, 0x604434, facing)
        }
      }

      const healthY = archetype === 'ram' ? 1.72 : archetype === 'brute' ? 1.72 : archetype === 'skirmisher' ? 1.15 : 1.3
      const healthWidth = archetype === 'ram' ? 1.5 : archetype === 'brute' ? 1.15 : 0.9
      this.healthBar(e.x, healthY, e.z, e.health, e.maxHealth, healthWidth)
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
      const baseColor = hit ? 0xff705e : this.townRenderer.readableNightColor(intactColor, night)

      if (plot) this.townRenderer.renderResidentialPlot(plot, b, night, state.residentialPlots)
      if (!b.complete && !b.destroyed && !plot && !def.fortification) {
        this.planningOverlays.renderBuildingPlanningOverlay(b, rotation)
      }

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
        this.townRenderer.renderFortification(b, rotation, baseColor, town.rank)
      } else if (b.type === 'campfire') {
        this.townRenderer.renderYard(b, rotation, 1.75, 0x5e503a)
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
        this.townRenderer.campfireGroundPool(b.x, b.z, 4.25, Math.max(night, atmosphere.twilight * 0.85))
        glowX += b.x * 1.4
        glowZ += b.z * 1.4
        glowWeight += 1.4
      } else if (b.type === 'stockpile') {
        this.townRenderer.renderStockpile(b, rotation, baseColor, night)
      } else if (b.type === 'house') {
        const occupiedNight = occupiedHomes.has(b.id) ? night : night * 0.18
        this.townRenderer.renderHouse(b, rotation, baseColor, occupiedNight, plot)
        if (occupiedHomes.has(b.id)) {
          const houseLight = this.rotatedOffset(0, 1.15, rotation)
          this.townRenderer.warmGroundPool(b.x + houseLight.x, b.z + houseLight.z, 4.15, 0.34, occupiedNight)
          glowX += b.x + houseLight.x * 0.35
          glowZ += b.z
          glowWeight++
        }
      } else if (b.type === 'guard-post') {
        this.townRenderer.renderGuardPost(b, rotation, baseColor, night, town.rank)
      } else if (b.type === 'tavern') {
        const serviceNight = b.inventory.ale > 0 ? night : night * 0.35
        const activity = state.enemies.length === 0 ? Math.max(atmosphere.twilight, night * 0.46) : 0
        this.townRenderer.renderTavern(b, rotation, baseColor, serviceNight, time, activity)
        if (b.inventory.ale > 0) {
          const tavernLight = this.rotatedOffset(0, 1.25, rotation)
          this.townRenderer.warmGroundPool(b.x + tavernLight.x, b.z + tavernLight.z, 5.1, 0.42, serviceNight)
          glowX += (b.x + tavernLight.x * 0.45) * 1.8
          glowZ += (b.z + tavernLight.z * 0.45) * 1.8
          glowWeight += 1.8
        }
      } else if (b.type === 'brewery') {
        this.townRenderer.renderBrewery(b, rotation, baseColor, time, night, productionPhaseActive)
      } else if (b.type === 'blacksmith') {
        this.townRenderer.renderBlacksmith(b, rotation, baseColor, time, night, productionPhaseActive)
      } else if (b.type === 'farmhouse') {
        this.townRenderer.renderFarmhouse(b, rotation, baseColor, night)
      } else if (b.type === 'foresters-lodge') {
        this.townRenderer.renderForestersLodge(b, rotation, baseColor, night)
      } else if (b.type === 'mine') {
        this.townRenderer.renderMine(b, rotation, baseColor, night)
      } else if (b.type === 'ore-yard') {
        this.townRenderer.renderOreYard(b, rotation, baseColor)
      } else if (b.type === 'fishing-hut') {
        this.townRenderer.renderFishingHut(b, rotation, baseColor, night)
      } else if (b.type === 'pleasure-house') {
        const activity = state.enemies.length === 0 && b.inventory.ale > 0 ? Math.max(atmosphere.twilight, night * 0.78) : 0
        this.townRenderer.renderPleasureHouse(b, rotation, baseColor, night, time, activity)
      } else {
        this.instance('buildings', b.x, 0.4, b.z, 2.8, 0.8, 2.8, baseColor, rotation)
      }

      if (b.complete && !b.destroyed && (damage === 'damaged' || damage === 'critical')) {
        const o = this.rotatedOffset(1.0, -1.0, rotation)
        this.instance('debris', b.x + o.x, 0.12, b.z + o.z, 0.55, 0.18, 0.3, 0x493d34, rotation + 0.5)
      }

      if (b.complete && (b.health < b.maxHealth || b.id === selectedId)) {
        const barY = def.fortification ? 2.2 : b.type === 'house' ? 3.8 : b.type === 'tavern' || b.type === 'pleasure-house' ? 3.65 : b.type === 'brewery' || b.type === 'blacksmith' || b.type === 'farmhouse' || b.type === 'foresters-lodge' || b.type === 'mine' || b.type === 'fishing-hut' ? 3.55 : b.type === 'campfire' ? 1.15 : 2.8
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
    const selectedField = state.fields.find(field => field.id === selectedId)
    this.selection.visible = !!selected
    this.fieldRenderer.updateSelection(selectedField, time)

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
      fog.near = Math.max(atmosphere.fogNear, this.regionSize > 47 ? this.zoom * 0.85 : 0)
      fog.far = Math.max(atmosphere.fogFar, this.regionSize > 47 ? this.zoom * 1.8 + 100 : 0)
    }
    this.groundMaterial.color.copy(this.nightGround).lerp(this.dayGround, atmosphere.daylight)
    // Preserve the existing daylight tint; the map already contains day meadow albedo.
    this.groundMaterial.color.r /= this.dayGround.r
    this.groundMaterial.color.g /= this.dayGround.g
    this.groundMaterial.color.b /= this.dayGround.b
    this.regionBackdrop.tint(this.groundMaterial.color)

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
    this.placementGhosts.showGhost(type, p, valid, rotationSteps, dragPoints, facingAngle)
  }

  showRoadGhost(points: Point[], valid: boolean, showGrid = false, width = 1.7): void {
    this.placementGhosts.showRoadGhost(points, valid, showGrid, width)
  }

  showFieldGhost(points: Point[], valid: boolean, showGrid = false): void {
    this.placementGhosts.showFieldGhost(points, valid, showGrid)
  }

  showResidentialPlotGhost(preview: ResidentialPlotPreview | null, valid: boolean, showGrid = false): void {
    this.placementGhosts.showResidentialPlotGhost(preview, valid, showGrid)
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

  screenPoint(point: Point, height = 1.2): { x: number; y: number } | null {
    const projected = new THREE.Vector3(point.x, height, point.z).project(this.camera)
    if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y) || projected.z < -1 || projected.z > 1) return null
    const rect = this.canvas.getBoundingClientRect()
    return {
      x: rect.left + (projected.x + 1) * 0.5 * rect.width,
      y: rect.top + (1 - projected.y) * 0.5 * rect.height,
    }
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
    this.roadTerrain.dispose()
    this.radialGlowTexture.dispose()
    this.sun.shadow.dispose()
    this.renderer.dispose()
  }
}
