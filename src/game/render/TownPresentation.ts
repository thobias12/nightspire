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
  roofBrown: 0x665044,
  roofDark: 0x4a4340,
  thatch: 0x967f57,
  earth: 0x574b36,
  earthLight: 0x746248,
  clothWine: 0x7a3f44,
  clothOchre: 0xa47a43,
  iron: 0x555d63,
} as const
