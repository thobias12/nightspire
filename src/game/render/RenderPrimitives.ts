import * as THREE from 'three'

export function createGableRoofGeometry(): THREE.BufferGeometry {
  const indexed = new THREE.BufferGeometry()
  const vertices = new Float32Array([
    -0.5, 0, -0.5,
     0.5, 0, -0.5,
     0, 0.5, -0.5,
    -0.5, 0,  0.5,
     0.5, 0,  0.5,
     0, 0.5,  0.5,
  ])

  const indices = [
    0, 2, 1,
    3, 4, 5,
    0, 3, 5, 0, 5, 2,
    1, 2, 5, 1, 5, 4,
  ]
  indexed.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
  indexed.setIndex(indices)

  const geometry = indexed.toNonIndexed()
  indexed.dispose()
  geometry.computeVertexNormals()
  return geometry
}

export function createRoofCourseGeometry(slope: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(1, 1, 1).rotateZ(slope)
}

export function createCartWheelGeometry(): THREE.BufferGeometry {
  return new THREE.TorusGeometry(0.5, 0.09, 5, 10).rotateY(Math.PI / 2)
}

export function createRadialGlowTexture(size = 64): THREE.DataTexture {
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
