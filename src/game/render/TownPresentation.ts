import type { Building } from '../simulation/WorldState'

export interface VisualRoadLink {
  fromId: number
  toId: number
  ax: number
  az: number
  bx: number
  bz: number
}

export interface VisualRoadStrip {
  x: number
  z: number
  length: number
  angle: number
}

const roadEligible = (building: Building): boolean =>
  building.complete
  && !building.destroyed
  && building.type !== 'wood-wall'
  && building.type !== 'wood-gate'

const distanceSquared = (a: Pick<Building, 'x' | 'z'>, b: Pick<Building, 'x' | 'z'>): number => {
  const dx = a.x - b.x
  const dz = a.z - b.z
  return dx * dx + dz * dz
}

/**
 * Presentation-only deterministic road graph.
 * It deliberately does not affect navigation, jobs, placement or simulation state.
 * A center-near stockpile is preferred as the first anchor, then every remaining
 * completed civic/economy building joins its nearest already-connected neighbor.
 */
export function visualRoadLinks(buildings: Building[]): VisualRoadLink[] {
  const eligible = buildings.filter(roadEligible)
  if (eligible.length < 2) return []

  const stockpiles = eligible.filter(building => building.type === 'stockpile')
  const anchor = (stockpiles.length ? stockpiles : eligible)
    .slice()
    .sort((a, b) => (a.x * a.x + a.z * a.z) - (b.x * b.x + b.z * b.z) || a.id - b.id)[0]

  const remaining = eligible.filter(building => building.id !== anchor.id)
    .sort((a, b) => distanceSquared(a, anchor) - distanceSquared(b, anchor) || a.id - b.id)
  const connected = [anchor]
  const links: VisualRoadLink[] = []

  for (const building of remaining) {
    const target = connected
      .slice()
      .sort((a, b) => distanceSquared(a, building) - distanceSquared(b, building) || a.id - b.id)[0]
    links.push({
      fromId: target.id,
      toId: building.id,
      ax: target.x,
      az: target.z,
      bx: building.x,
      bz: building.z,
    })
    connected.push(building)
  }

  return links
}

export function visualRoadStrip(link: VisualRoadLink): VisualRoadStrip {
  const dx = link.bx - link.ax
  const dz = link.bz - link.az
  return {
    x: (link.ax + link.bx) / 2,
    z: (link.az + link.bz) / 2,
    length: Math.max(0.01, Math.hypot(dx, dz)),
    angle: Math.atan2(dx, dz),
  }
}

export const TOWN_PALETTE = {
  plasterWarm: 0xb7a486,
  plasterCool: 0x9f9a8b,
  timberDark: 0x4b3628,
  timberMid: 0x684a33,
  stone: 0x77766d,
  stoneDark: 0x595c59,
  roofBrown: 0x554238,
  roofDark: 0x3e3a39,
  thatch: 0x8a744b,
  earth: 0x574b36,
  earthLight: 0x746248,
  clothWine: 0x7a3f44,
  clothOchre: 0xa47a43,
  iron: 0x555d63,
} as const
