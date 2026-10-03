import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import treeUrl from '../../../assets/world/grounded/island_tree_01.glb?url'
import barrelUrl from '../../../assets/world/grounded/wine_barrel_01.glb?url'
import rockUrl from '../../../assets/world/grounded/rock_09.glb?url'
import { applyLeafCutout } from './LeafCutout'

type ModelId = 'tree' | 'barrel' | 'rock'
const sources: Record<ModelId, readonly [string, number]> = {
  tree: [treeUrl,24], barrel: [barrelUrl,128], rock: [rockUrl,256],
}

/** A few shared primitive batches, never one glTF object or material per entity. */
export class GroundedModels {
  private readonly batches = new Map<ModelId, THREE.InstancedMesh[]>()
  private readonly textures = new Set<THREE.Texture>()
  private readonly matrix = new THREE.Object3D()
  private disposed = false
  readonly ready: Promise<void>
  loaded = 0
  readonly errors: string[] = []

  constructor(private readonly scene: THREE.Scene) {
    this.ready = Promise.all((Object.keys(sources) as ModelId[]).map(async id => {
      try {
        const gltf = await new GLTFLoader().loadAsync(sources[id][0])
        const meshes: THREE.InstancedMesh[] = []
        gltf.scene.updateMatrixWorld(true)
        gltf.scene.traverse(object => {
          if (!(object instanceof THREE.Mesh)) return
          const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld)
          const materials: THREE.Material[] = Array.isArray(object.material) ? object.material : [object.material]
          for (const material of materials) {
            if (material instanceof THREE.MeshStandardMaterial) {
              material.color.setHex(0xffffff)
              material.aoMapIntensity = 0.5
              if (material.name.includes('leaves')) {
                // Source JPEG atlas has black backing rather than an alpha channel.
                // Use opaque cutouts, avoiding blended leaf sorting/dark rectangles.
                applyLeafCutout(material)
              }
              for (const texture of [material.map,material.normalMap,material.roughnessMap,material.metalnessMap,material.aoMap]) {
                if (texture) { texture.anisotropy = 4; if (this.disposed) texture.dispose(); else this.textures.add(texture) }
              }
            }
          }
          object.geometry.dispose()
          const mesh = new THREE.InstancedMesh(geometry,object.material,sources[id][1])
          const leaf = materials.find(m => m.name.includes('leaves'))
          if (leaf instanceof THREE.MeshStandardMaterial) {
            mesh.customDepthMaterial = new THREE.MeshDepthMaterial({map:leaf.map,depthPacking:THREE.RGBADepthPacking,side:THREE.DoubleSide})
            applyLeafCutout(mesh.customDepthMaterial)
          }
          mesh.count = 0; mesh.frustumCulled = false
          mesh.castShadow = true; mesh.receiveShadow = true; mesh.layers.enable(1)
          mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
          meshes.push(mesh)
        })
        if (this.disposed) { this.disposeMeshes(meshes); return }
        this.batches.set(id,meshes)
        for (const mesh of meshes) this.scene.add(mesh)
        this.loaded++
      } catch (error) { this.errors.push(`${id}: ${String(error)}`); console.warn('Model load failed:',id,error) }
    })).then(() => undefined)
  }

  begin(): void { for (const meshes of this.batches.values()) for (const mesh of meshes) mesh.count = 0 }

  emit(id: ModelId, x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw: number, pitch = 0): boolean {
    const meshes = this.batches.get(id)
    if (!meshes?.length || meshes[0].count >= sources[id][1]) return false
    this.matrix.position.set(x,y,z); this.matrix.scale.set(sx,sy,sz)
    this.matrix.rotation.set(pitch,yaw,0,'YXZ'); this.matrix.updateMatrix()
    for (const mesh of meshes) mesh.setMatrixAt(mesh.count++,this.matrix.matrix)
    return true
  }

  finish(): void { for (const meshes of this.batches.values()) for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true }

  private disposeMeshes(meshes: THREE.InstancedMesh[]): void {
    for (const mesh of meshes) {
      this.scene.remove(mesh); mesh.dispose(); mesh.geometry.dispose()
      mesh.customDepthMaterial?.dispose()
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.dispose()
    }
  }

  dispose(): void {
    this.disposed = true
    for (const meshes of this.batches.values()) this.disposeMeshes(meshes)
    for (const texture of this.textures) texture.dispose()
    this.batches.clear(); this.textures.clear()
  }
}
