import * as THREE from 'three'

export class SceneRenderer {
  readonly canvas: HTMLCanvasElement
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500)

  private readonly renderer: THREE.WebGLRenderer
  private readonly sun = new THREE.DirectionalLight(0xfff0cf, 2.4)
  private readonly ambient = new THREE.HemisphereLight(0xb8c7ff, 0x3b2d22, 1.25)

  constructor() {
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'game-canvas'

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    this.scene.background = new THREE.Color(0x9db5cc)
    this.scene.fog = new THREE.Fog(0x9db5cc, 65, 150)

    this.camera.position.set(30, 25, 34)
    this.camera.lookAt(0, 0, 0)

    this.sun.position.set(-30, 45, 20)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    this.scene.add(this.sun, this.ambient)

    this.addGrayboxWorld()
  }

  resize(width: number, height: number): void {
    this.camera.aspect = Math.max(width, 1) / Math.max(height, 1)
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
  }

  setTimeOfDay(t: number): void {
    const normalized = ((t % 1) + 1) % 1
    const daylight = THREE.MathUtils.clamp(Math.sin(normalized * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5, 0.08, 1)
    this.sun.intensity = 0.25 + daylight * 2.2
    this.ambient.intensity = 0.35 + daylight * 1.1

    const night = new THREE.Color(0x11182c)
    const day = new THREE.Color(0x9db5cc)
    const sky = night.clone().lerp(day, daylight)
    this.scene.background = sky
    if (this.scene.fog) this.scene.fog.color.copy(sky)
  }

  render(): void {
    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    this.renderer.dispose()
  }

  private addGrayboxWorld(): void {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(140, 140),
      new THREE.MeshStandardMaterial({ color: 0x617248, roughness: 1 }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    this.scene.add(ground)

    const settlement = new THREE.Group()
    const hutMaterial = new THREE.MeshStandardMaterial({ color: 0x806145, roughness: 0.95 })
    for (const [x, z] of [[-6, -3], [1, -5], [7, 0], [-2, 5]] as const) {
      const hut = new THREE.Mesh(new THREE.BoxGeometry(4, 2.6, 4), hutMaterial)
      hut.position.set(x, 1.3, z)
      hut.castShadow = true
      hut.receiveShadow = true
      settlement.add(hut)
    }
    this.scene.add(settlement)

    const treeGeometry = new THREE.ConeGeometry(1.2, 4.5, 7)
    const treeMaterial = new THREE.MeshStandardMaterial({ color: 0x324a2d, roughness: 1 })
    const trees = new THREE.InstancedMesh(treeGeometry, treeMaterial, 48)
    const matrix = new THREE.Matrix4()
    for (let i = 0; i < 48; i += 1) {
      const angle = i * 2.399
      const radius = 24 + (i % 9) * 2.3
      matrix.makeTranslation(Math.cos(angle) * radius, 2.25, Math.sin(angle) * radius)
      trees.setMatrixAt(i, matrix)
    }
    trees.castShadow = true
    trees.receiveShadow = true
    this.scene.add(trees)
  }
}
