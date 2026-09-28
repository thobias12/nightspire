import * as THREE from 'three'
import { forestDensity, horizonHeight, landscapeNoise, mapHash, type MapDefinition } from '../world/MapGenerator'

/** Regenerated only when the region changes. No simulation entities or updates. */
export class RegionalBackdrop extends THREE.Group {
  private key = ''
  tint(color: THREE.Color): void {
    const ground = this.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | undefined
    ground?.material.color.copy(color)
  }
  update(map?: MapDefinition): void {
    const key = JSON.stringify(map) ?? ''
    if (key === this.key) return
    this.key = key
    this.traverse(object => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose()
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose()
        if (object instanceof THREE.InstancedMesh) object.dispose()
      }
    })
    this.clear()
    if (!map) return
    const half = (map.size + 20) / 2, positions: number[] = [], colors: number[] = [], indices: number[] = []
    const segments = 256, rings = 24, color = new THREE.Color()
    for (let ring = 0; ring <= rings; ring++) for (let i = 0; i <= segments; i++) {
      const side = Math.min(3, Math.floor(i / (segments / 4))), t = (i - side * segments / 4) / (segments / 4)
      const extent = half + ring * 18, along = (t * 2 - 1) * extent
      const x = side === 0 ? along : side === 1 ? extent : side === 2 ? -along : -extent
      const z = side === 0 ? -extent : side === 1 ? along : side === 2 ? extent : -along
      positions.push(x, ring === 0 ? 0 : horizonHeight(x, z, map), z)
      const tint = (landscapeNoise(x / 27, z / 27, map.seed + 101) - 0.5) * 18 - forestDensity(x, z, map) * 10
      color.setRGB((97 + tint) / 255, (114 + tint) / 255, (72 + tint) / 255, THREE.SRGBColorSpace)
      colors.push(color.r, color.g, color.b)
      if (ring < rings && i < segments) {
        const a = ring * (segments + 1) + i, b = a + segments + 1
        indices.push(a, b, a + 1, a + 1, b, b + 1)
      }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geometry.setIndex(indices); geometry.computeVertexNormals()
    const ground = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }))
    ground.receiveShadow = true; this.add(ground)
    const trees = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x3d563b, roughness: 1 }), 1600)
    const matrix = new THREE.Object3D(); trees.count = 0
    for (let i = 0; i < 6000 && trees.count < 1600; i++) {
      const x = (mapHash(i, 1, map.seed) * 2 - 1) * (half + 150)
      const z = (mapHash(i, 2, map.seed) * 2 - 1) * (half + 150)
      if (Math.max(Math.abs(x), Math.abs(z)) < half + 4 || mapHash(i, 3, map.seed) > forestDensity(x, z, map)) continue
      const scale = 1.6 + mapHash(i, 4, map.seed) * 1.3
      matrix.position.set(x, horizonHeight(x, z, map) + scale, z)
      matrix.scale.set(scale, scale * 1.6, scale); matrix.rotation.y = i * 2.4; matrix.updateMatrix()
      trees.setMatrixAt(trees.count++, matrix.matrix)
    }
    trees.computeBoundingSphere(); this.add(trees)
  }
}
