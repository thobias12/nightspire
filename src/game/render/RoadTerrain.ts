import type { MapDefinition } from '../world/MapGenerator'
import * as THREE from 'three'
import type { RoadPath } from '../model/WorldState'
import { createMeadowField, createRoadSurface, ROAD_SURFACE_SIZE, type MeadowField, type RoadSurface } from './RoadSurface'

/** Owns one terrain texture for the entire settlement, rebuilt only on edits/load. */
export class RoadTerrain {
  readonly texture = new THREE.DataTexture(new Uint8Array(4), 1, 1)
  surface: RoadSurface | null = null
  private snapshot: number[] = []
  private mapKey = ''
  private size = ROAD_SURFACE_SIZE
  private meadow: MeadowField | undefined

  constructor(private extent: number) {
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.texture.flipY = true
    this.texture.magFilter = THREE.LinearFilter
    this.texture.minFilter = THREE.LinearMipmapLinearFilter
    this.texture.generateMipmaps = true
    this.texture.anisotropy = 4
  }
  private matches(roads: readonly RoadPath[]): boolean {
    let i = 0
    if (this.snapshot[i++] !== roads.length) return false
    for (const r of roads) {
      if (this.snapshot[i++] !== r.id || this.snapshot[i++] !== r.width || this.snapshot[i++] !== r.points.length) return false
      for (const p of r.points) if (this.snapshot[i++] !== p.x || this.snapshot[i++] !== p.z) return false
    }
    return i === this.snapshot.length
  }
  update(roads: readonly RoadPath[], map?: MapDefinition): void {
    const key = map ? map.seed + ':' + map.size + ':' + map.landscape : ''
    if (key !== this.mapKey) {
      this.mapKey = key; this.extent = (map?.size ?? 47) + 20
      this.size = map ? 2048 : ROAD_SURFACE_SIZE; this.meadow = undefined; this.snapshot = []
    }
    if (this.matches(roads)) return
    this.meadow ??= createMeadowField(this.extent, this.size, map)
    this.surface = createRoadSurface(roads, this.extent, this.size, this.meadow)
    this.texture.image = { data: this.surface.pixels, width: this.size, height: this.size }
    this.texture.needsUpdate = true
    this.snapshot = [roads.length]
    for (const r of roads) {
      this.snapshot.push(r.id, r.width, r.points.length)
      for (const p of r.points) this.snapshot.push(p.x, p.z)
    }
  }
  dispose(): void { this.texture.dispose() }
}
