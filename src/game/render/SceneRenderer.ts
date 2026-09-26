import * as THREE from 'three'
import { BUILDINGS, type BuildingId } from '../data/buildings'
import { RESOURCES } from '../data/resources'
import { MAP_SIZE } from '../simulation/Navigation'
import type { Point, WorldState } from '../simulation/WorldState'

export type CameraMode = 'settlement' | 'follow'

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
  private readonly sun = new THREE.DirectionalLight(0xfff0cf, 2.4)
  private readonly ambient = new THREE.HemisphereLight(0xb8c7ff, 0x3b2d22, 1.25)
  private readonly matrix = new THREE.Object3D()
  private readonly batches: Record<string, THREE.InstancedMesh> = {}
  private readonly batchColors: Record<string, number> = {}
  private readonly geometry = new THREE.BoxGeometry(1, 1, 1)
  private readonly ghost: THREE.Mesh
  private readonly selection: THREE.Mesh
  private readonly paths: THREE.LineSegments
  private readonly ray = new THREE.Raycaster()
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  private readonly dayColor = new THREE.Color(0x9db5cc)
  private readonly nightColor = new THREE.Color(0x11182c)

  constructor() {
    this.canvas.className = 'game-canvas'
    this.canvas.tabIndex = 0
    this.canvas.setAttribute('aria-label', 'Settlement world. Click to inspect or place a building.')

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    this.scene.background = new THREE.Color()
    this.scene.fog = new THREE.Fog(0x9db5cc, 60, 130)

    this.sun.position.set(-20, 40, 20)
    this.sun.castShadow = true
    Object.assign(this.sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, far: 100 })
    this.sun.shadow.mapSize.set(1024, 1024)
    this.sun.shadow.normalBias = 0.03
    this.scene.add(this.sun, this.ambient)

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE),
      new THREE.MeshStandardMaterial({ color: 0x617248, roughness: 1 }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    this.scene.add(ground)

    const grid = new THREE.GridHelper(46, 46, 0x8e9b7c, 0x738260)
    grid.position.y = 0.012
    this.scene.add(grid)

    this.addBatch('wood', new THREE.ConeGeometry(0.65, 2.8, 6), 0x354d36, 1000)
    this.addBatch('food', new THREE.DodecahedronGeometry(0.65, 0), 0x91a95d, 1000)
    this.addBatch('settlers', new THREE.CapsuleGeometry(0.22, 0.45, 3, 5), 0xe6ce9c, 10)
    this.addBatch('guards', new THREE.CapsuleGeometry(0.24, 0.5, 3, 5), 0xa96f52, 10)
    this.addBatch('enemies', new THREE.CapsuleGeometry(0.26, 0.5, 3, 5), 0x6f2525, 64)
    this.addBatch('cargo', this.geometry, 0xffffff, 10)
    this.addBatch('buildings', this.geometry, 0xffffff, 120)
    this.addBatch('fortifications', this.geometry, 0xffffff, 120)
    this.addBatch('campfireFire', new THREE.ConeGeometry(0.28, 0.65, 6), 0xf0a14a, 120)
    this.addBatch('roofs', new THREE.ConeGeometry(1, 1, 4), 0x594739, 120)
    this.addBatch('progress', this.geometry, 0xe4bc6b, 120)
    this.addBatch('doors', this.geometry, 0xf6dba0, 120)
    this.addBatch('player', new THREE.CapsuleGeometry(0.3, 0.65, 4, 6), 0x73d9dd, 1)
    this.addBatch('healthBack', this.geometry, 0x2b211f, 256)
    this.addBatch('healthFill', this.geometry, 0x76b56e, 256)

    this.ghost = new THREE.Mesh(
      this.geometry,
      new THREE.MeshBasicMaterial({ color: 0x82d6a4, transparent: true, opacity: 0.45, depthWrite: false }),
    )
    this.ghost.visible = false
    this.scene.add(this.ghost)

    this.selection = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 0.72, 32),
      new THREE.MeshBasicMaterial({ color: 0xffde9c, side: THREE.DoubleSide }),
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
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.count = 0
    mesh.castShadow = !name.startsWith('health')
    mesh.receiveShadow = !name.startsWith('health')
    mesh.frustumCulled = false
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
    mesh.setColorAt(i, new THREE.Color(color ?? this.batchColors[name]))
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

  sync(state: WorldState, selectedId: number | null): void {
    for (const mesh of Object.values(this.batches)) mesh.count = 0

    for (const n of state.nodes) {
      if (n.remaining > 0) this.instance(n.resource, n.x, n.resource === 'wood' ? 1.4 : 0.5, n.z)
    }

    for (const a of state.settlers) {
      const hit = this.recentlyHit(a.lastHitTick, state.tick)
      const color = hit ? 0xff7868 : a.health <= 0 ? 0x555555 : undefined
      this.instance(a.role === 'guard' ? 'guards' : 'settlers', a.x, 0.55, a.z, 1, 1, 1, color)
      this.healthBar(a.x, 1.25, a.z, a.health, a.maxHealth, 0.8)

      const resource = a.cargo.wood > 0 ? 'wood' : a.cargo.food > 0 ? 'food' : null
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

    for (const b of state.buildings) {
      const def = BUILDINGS[b.type]
      const hit = this.recentlyHit(b.lastHitTick, state.tick)
      const baseColor = hit ? 0xff705e : b.destroyed ? 0x4d4641 : b.complete ? def.color : 0x777c80

      if (def.fortification) {
        const height = b.destroyed
          ? 0.18
          : b.complete
            ? (b.type === 'wood-gate' ? 1.8 : 1.35)
            : 0.2 + b.work / def.constructionWork
        const width = b.type === 'wood-gate' ? 0.82 : 0.92
        this.instance('fortifications', b.x, height / 2, b.z, width, height, 0.82, baseColor)

        if (b.type === 'wood-gate' && b.complete && !b.destroyed) {
          this.instance('fortifications', b.x, 1.7, b.z, 1.35, 0.22, 0.32, hit ? 0xff705e : 0x5f432e)
        }
      } else if (b.type === 'campfire') {
        const height = b.complete ? 0.24 : 0.12 + b.work / def.constructionWork * 0.12
        this.instance('buildings', b.x, height / 2, b.z, 1.15, height, 1.15, baseColor)
        if (b.complete && !b.destroyed) {
          this.instance('campfireFire', b.x, 0.55, b.z, 1, 1, 1, hit ? 0xff705e : undefined)
        }
      } else {
        const completeHeight = b.type === 'house' ? 2.3 : b.type === 'guard-post' ? 1.6 : b.type === 'tavern' ? 2.05 : 0.5
        const height = b.complete ? completeHeight : 0.25 + b.work / def.constructionWork * 1.5
        this.instance('buildings', b.x, height / 2, b.z, 2.8, height, 2.8, baseColor)
        this.instance('doors', b.x, 0.05, b.z + 2, 0.65, 0.06, 0.65)

        if (b.complete && b.type === 'house') {
          this.instance('roofs', b.x, 2.9, b.z, 2.3, 1.2, 2.3, hit ? 0xff705e : undefined, Math.PI / 4)
        }
        if (b.complete && b.type === 'guard-post') {
          this.instance('roofs', b.x, 2.15, b.z, 1.8, 0.8, 1.8, hit ? 0xff705e : 0x493a31, Math.PI / 4)
        }
        if (b.complete && b.type === 'tavern') {
          this.instance('roofs', b.x, 2.72, b.z, 2.35, 1.0, 2.35, hit ? 0xff705e : 0x654633, Math.PI / 4)
          this.instance('doors', b.x + 1.1, 1.25, b.z + 1.55, 0.16, 1.45, 0.16, 0xd6a756)
        }
      }

      if (b.complete && (b.health < b.maxHealth || b.id === selectedId)) {
        const barY = def.fortification ? 2.2 : b.type === 'house' ? 3.7 : b.type === 'tavern' ? 3.55 : b.type === 'campfire' ? 1.15 : 2.6
        this.healthBar(b.x, barY, b.z, b.health, b.maxHealth, def.fortification ? 1.1 : 2.2)
      }

      if (!b.complete) {
        const cost = def.buildCost.wood + def.buildCost.food
        const ratio = ((b.delivered.wood + b.delivered.food) / Math.max(cost, 1) + b.work / def.constructionWork) / 2
        const y = def.fortification ? 1.55 : 2.9
        const width = def.fortification ? 0.9 : 2.6
        this.instance('progress', b.x - width / 2 + ratio * width / 2, y, b.z, Math.max(0.04, ratio * width), 0.12, 0.18)
      }
    }

    for (const mesh of Object.values(this.batches)) {
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }

    const selected = [...state.settlers, ...state.enemies, ...state.nodes, ...state.buildings].find(e => e.id === selectedId)
    this.selection.visible = !!selected
    if (selected) this.selection.position.set(selected.x, 0.04, selected.z)

    const daylight = THREE.MathUtils.clamp(
      Math.sin(state.timeOfDay * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5,
      0.08,
      1,
    )
    this.sun.intensity = 0.22 + daylight * 2.25
    this.ambient.intensity = 0.45 + daylight * 1.05
    const sky = (this.scene.background as THREE.Color).copy(this.nightColor).lerp(this.dayColor, daylight)
    this.scene.fog!.color.copy(sky)

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

  showGhost(type: BuildingId | null, p: Point | null, valid: boolean): void {
    this.ghost.visible = !!type && !!p
    if (!type || !p) return

    const def = BUILDINGS[type]
    const height = def.fortification ? (type === 'wood-gate' ? 1.8 : 1.35) : type === 'tavern' ? 2.05 : 0.7
    this.ghost.position.set(p.x, height / 2, p.z)
    this.ghost.scale.set(def.footprint, height, def.footprint)
    ;(this.ghost.material as THREE.MeshBasicMaterial).color.set(valid ? 0x82d6a4 : 0xed7474)
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
    this.sun.shadow.dispose()
    this.renderer.dispose()
  }
}
