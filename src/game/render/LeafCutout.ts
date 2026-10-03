import type * as THREE from 'three'

/** Same cutout in beauty and depth passes; no blended rectangles or solid shadows. */
export function applyLeafCutout(material: THREE.Material): void {
  material.transparent = false; material.depthWrite = true
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>',
      '#include <map_fragment>\n if (max(diffuseColor.r,max(diffuseColor.g,diffuseColor.b)) < 0.015) discard;')
  }
  material.customProgramCacheKey = () => 'grounded-leaf-cutout-v1'
}
