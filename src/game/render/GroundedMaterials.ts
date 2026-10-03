import * as THREE from 'three'
import timberColor from '../../../assets/world/grounded/timber-color.webp?url'
import timberNormal from '../../../assets/world/grounded/timber-normal.webp?url'
import timberRough from '../../../assets/world/grounded/timber-rough.webp?url'
import plasterColor from '../../../assets/world/grounded/plaster-color.webp?url'
import plasterNormal from '../../../assets/world/grounded/plaster-normal.webp?url'
import plasterRough from '../../../assets/world/grounded/plaster-rough.webp?url'
import roofColor from '../../../assets/world/grounded/roof-color.webp?url'
import roofNormal from '../../../assets/world/grounded/roof-normal.webp?url'
import roofRough from '../../../assets/world/grounded/roof-rough.webp?url'
import clothColor from '../../../assets/world/grounded/cloth-color.webp?url'
import clothNormal from '../../../assets/world/grounded/cloth-normal.webp?url'
import clothRough from '../../../assets/world/grounded/cloth-rough.webp?url'

const sources = {
  timber: [timberColor, timberNormal, timberRough], plaster: [plasterColor, plasterNormal, plasterRough],
  roof: [roofColor, roofNormal, roofRough], cloth: [clothColor, clothNormal, clothRough],
} as const
type Surface = keyof typeof sources

/** One set of maps per surface, shared by every instance and building family. */
export class GroundedMaterials {
  private readonly textures = new Map<string, THREE.Texture>()
  private disposed = false
  loaded = 0
  errors = 0

  apply(material: THREE.MeshStandardMaterial, surface: Surface): void {
    const maps = sources[surface].map((url, i) => {
      let texture = this.textures.get(url)
      if (!texture) {
        texture = new THREE.TextureLoader().load(url,
          loaded => { if (this.disposed) loaded.dispose(); else this.loaded++ },undefined,
          error => { this.errors++; console.warn('Surface map load failed:',url,error) })
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping
        texture.anisotropy = 4
        if (i === 0) texture.colorSpace = THREE.SRGBColorSpace
        this.textures.set(url, texture)
      }
      return texture
    })
    material.map = maps[0]; material.normalMap = maps[1]; material.roughnessMap = maps[2]
    material.normalScale.setScalar(surface === 'cloth' ? 0.25 : 0.45)
    // Instance colors already supply the palette; tinting twice made surfaces black.
    material.color.setHex(0xffffff)
    material.onBeforeCompile = shader => {
      const coordinates = surface === 'roof' ? 'nsPosition.zx' :
        'abs(normal.y) > 0.5 ? nsPosition.xz : abs(normal.x) > 0.5 ? nsPosition.zy : nsPosition.xy'
      shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
        #ifdef USE_INSTANCING
          vec3 nsSize = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          vec3 nsPosition = position * nsSize;
          vec2 nsUV = (${coordinates}) * ${surface === 'plaster' ? '0.55' : surface === 'roof' ? '1.8' : '1.2'};
          #ifdef USE_MAP
            vMapUv = nsUV;
          #endif
          #ifdef USE_NORMALMAP
            vNormalMapUv = nsUV;
          #endif
          #ifdef USE_ROUGHNESSMAP
            vRoughnessMapUv = nsUV;
          #endif
        #endif`)
    }
    material.customProgramCacheKey = () => `grounded-${surface}-v1`
    material.needsUpdate = true
  }

  dispose(): void { this.disposed = true; for (const texture of this.textures.values()) texture.dispose(); this.textures.clear() }
}
