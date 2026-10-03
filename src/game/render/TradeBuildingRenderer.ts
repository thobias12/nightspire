import type { Building } from '../model/WorldState'
import type { TreeInstanceFn } from './TreeRenderer'
import type { RotateOffset } from './PlacementGhostRenderer'
import { visibleStockUnits } from './VillagePresentation'

/** Functional period silhouettes for the two previously generic trade cubes. */
export class TradeBuildingRenderer {
  constructor(private readonly instance: TreeInstanceFn, private readonly rotate: RotateOffset) {}

  render(b: Building, yaw: number): void {
    const part = (name: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number) => {
      const p = this.rotate(x,z,yaw)
      this.instance(name,b.x+p.x,y,b.z+p.z,sx,sy,sz,color,yaw)
    }
    if (b.type === 'market') {
      part('stone',0,0.08,0,2.8,0.16,2.8,0x827967)
      for (const side of [-1,1]) {
        const center = side * 0.76
        for (const x of [-0.5,0.5]) for (const z of [-0.62,0.62]) part('timber',center+x,0.76,z,0.08,1.5,0.08,0x73543c)
        part('timber',center,1.42,0,1.16,0.09,1.48,0x76543a)
        part('cloth',center,1.48,0,1.24,0.07,1.6,side < 0 ? 0x9e8264 : 0x746f59)
        part('timber',center,0.64,0.12,1.16,0.12,1.1,0x846346)
        for (let i=0; i<visibleStockUnits(b.inventory.food,3,6); i++) part('baskets',center-0.35+i*0.32,0.8,0.15,0.52,0.62,0.52,0xa88852)
      }
    } else {
      part('stone',0,0.16,0,2.6,0.32,2.7,0x777467)
      part('plaster',0,0.94,-0.28,2.28,1.55,2.05,0xb8ab87)
      for (const x of [-1.14,0,1.14]) for (const z of [-1.31,0.75]) part('timber',x,0.97,z,0.12,1.58,0.12,0x684c35)
      for (const y of [0.34,1.05,1.72]) part('timber',0,y,0.79,2.4,0.1,0.12,0x684c35)
      part('villageRoofs',0,1.73,-0.28,2.85,1.9,2.75,0x827665)
      part('doors',0,0.92,0.8,0.85,1.2,0.06,0x685037)
      for (const x of [-0.9,0.9]) part('timber',x,0.65,1.15,0.1,1.28,0.1,0x6f5138)
      part('cloth',0,1.34,1.05,2.15,0.08,0.95,0x968265)
      for (let i=0; i<visibleStockUnits(b.inventory.wood,4,8); i++) part('logs',-0.65+i*0.3,0.25,-0.05,0.8,0.85,0.85,0x89633e)
      for (let i=0; i<visibleStockUnits(b.inventory.food+b.inventory.ale,3,6); i++) part('barrels',0.8-i*0.42,0.27,1.16,0.38,0.54,0.38,0x896741)
    }
  }
}
