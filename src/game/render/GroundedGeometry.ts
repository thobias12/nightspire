import * as THREE from 'three'

/** Shared sewn silhouettes, with a neck opening, shoulders and cloth hem. */
export function createGarmentGeometry(kind: 'tunic' | 'bodice' | 'skirt' | 'coat'): THREE.BufferGeometry {
  const rings: number[][] = kind === 'skirt' ? [[0,-0.325],[0.31,-0.325],[0.3,-0.29],[0.27,-0.15],[0.2,0.14],[0.12,0.325],[0,0.325]]
    : kind === 'bodice' ? [[0,-0.26],[0.17,-0.26],[0.14,-0.12],[0.18,0.07],[0.21,0.2],[0.1,0.27],[0,0.27]]
    : [[0,-0.34],[kind === 'coat' ? 0.27 : 0.24,-0.34],[0.24,-0.3],[0.18,-0.08],[0.2,0.14],[0.23,0.25],[0.1,0.34],[0,0.34]]
  const geometry = new THREE.LatheGeometry(rings.map(([r,y]) => new THREE.Vector2(r,y)), 12)
  geometry.scale(1, 1, kind === 'skirt' ? 0.88 : 0.66)
  // Small deterministic folds; fixed geometry, no per-character deformation work.
  const positions = geometry.getAttribute('position')
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i), y = positions.getY(i)
    const fold = 1 + Math.sin(Math.atan2(z,x) * 6) * 0.035 * Math.max(0, 0.3 - y)
    positions.setXYZ(i, x * fold, y, z * fold)
  }
  geometry.computeVertexNormals()
  return geometry
}

export function createLimbGeometry(leg: boolean): THREE.BufferGeometry {
  const rings = leg ? [[0,-0.24],[0.067,-0.24],[0.065,-0.19],[0.052,-0.1],[0.065,0.04],[0.085,0.21],[0,0.24]]
    : [[0,-0.23],[0.037,-0.23],[0.055,-0.16],[0.046,-0.02],[0.06,0.07],[0.069,0.2],[0,0.23]]
  const geometry = new THREE.LatheGeometry(rings.map(([r,y]) => new THREE.Vector2(r,y)), 8)
  geometry.scale(1,1,0.85)
  return geometry
}

/** Explicit UVs are required by the shared roof maps even with projected sampling. */
export function addRoofUvs(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const p = geometry.getAttribute('position'), uv = new Float32Array(p.count * 2)
  for (let i = 0; i < p.count; i++) { uv[i*2] = p.getZ(i)+0.5; uv[i*2+1] = p.getX(i)+0.5 }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv,2))
  return geometry
}
