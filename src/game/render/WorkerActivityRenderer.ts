import { RESOURCE_IDS } from '../data/resources'
import type { Building, Settler } from '../model/WorldState'
import type { TreeInstanceFn } from './TreeRenderer'
import { visibleStockUnits, type WorkerActivity } from './VillagePresentation'

/** Props only. Shared batches, no per-agent objects, clocks or gameplay updates. */
export class WorkerActivityRenderer {
  constructor(private readonly instance: TreeInstanceFn) {}

  render(settler: Settler, activity: WorkerActivity, facing: number, time: number, timberOx: boolean): void {
    if (settler.health <= 0) return
    const forwardX = Math.sin(facing), forwardZ = Math.cos(facing)
    const sideX = Math.cos(facing), sideZ = -Math.sin(facing)
    const x = settler.x + forwardX * 0.28, z = settler.z + forwardZ * 0.28
    const resource = RESOURCE_IDS.find(resource => settler.cargo[resource] > 0)
    if (resource && !(timberOx && resource === 'wood')) {
      if (resource === 'wood') {
        for (let i = 0; i < visibleStockUnits(settler.cargo.wood, 2, 3); i++) {
          this.instance('logs', x + sideX * (i - 1) * 0.12, 0.91 + (i % 2) * 0.1, z + sideZ * (i - 1) * 0.12, 0.84, 0.58, 0.58, 0x725035, facing)
        }
      } else if (resource === 'food') {
        this.instance('sacks', x, 0.83, z, 0.52, 0.65, 0.44, 0xb29d73, facing)
      } else if (resource === 'ale') {
        this.instance('barrels', x, 0.84, z, 0.42, 0.55, 0.42, 0x785336, facing)
      } else {
        this.instance('baskets', x, 0.75, z, 1.45, 1.1, 1.3, 0x8a6943, facing)
        if (resource === 'ore') this.instance('ore', x, 0.94, z, 0.27, 0.23, 0.27, 0x707982, facing)
        else this.instance('metal', x, 0.98, z, 0.4, 0.06, 0.1, 0x72787b, facing)
      }
    }
    if (activity === 'build') {
      // Same deterministic phase drives the figure's right hand and its hammer.
      const lift = (Math.sin(time * 7 + settler.id) + 1) * 0.16
      const hx = x + sideX * 0.22, hz = z + sideZ * 0.22
      this.instance('timber', hx, 1.03 + lift, hz, 0.045, 0.4, 0.045, 0x715038, facing)
      this.instance('metal', hx, 1.23 + lift, hz, 0.24, 0.12, 0.11, 0x707779, facing)
    }
    if (activity === 'gather' && !timberOx && !resource) {
      this.instance('baskets', x + sideX * 0.42, 0.16, z + sideZ * 0.42, 1.2, 0.8, 1.2, 0x997748, facing)
    }
  }

  renderDeliveredTimber(building: Building, rotation: number): void {
    if (building.complete || building.destroyed) return
    const count = visibleStockUnits(building.delivered.wood, 5, 6)
    const sideX = Math.cos(rotation), sideZ = -Math.sin(rotation)
    const frontX = Math.sin(rotation), frontZ = Math.cos(rotation)
    for (let i = 0; i < count; i++) {
      const side = 0.5 + (i % 3) * 0.18, front = 1.35
      this.instance('logs', building.x + sideX * side + frontX * front, 0.14 + Math.floor(i / 3) * 0.18, building.z + sideZ * side + frontZ * front, 1.2, 0.85, 0.85, 0x755139, rotation)
    }
  }
}
