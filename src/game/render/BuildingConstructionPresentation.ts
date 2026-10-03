/** Renderer-only assembly projection. No scene objects or persisted phase state. */
export type AssemblyStage = 'foundation' | 'frame' | 'infill' | 'roof' | 'finishing' | 'complete'

export function constructionRatio(work: number, total: number, complete: boolean): number {
  return complete ? 1 : Math.max(0, Math.min(0.999, Number.isFinite(work / total) ? work / total : 0))
}

export function assemblyStage(ratio: number): AssemblyStage {
  return ratio >= 1 ? 'complete' : ratio < 0.12 ? 'foundation' : ratio < 0.38 ? 'frame'
    : ratio < 0.66 ? 'infill' : ratio < 0.9 ? 'roof' : 'finishing'
}

const roofs = new Set(['gableRoofs', 'villageRoofs', 'roofs'])
const surfaces = new Set(['yardPatch', 'groundWear', 'plotGround', 'foundation'])
const structure = new Set(['timber', 'trim', 'braceL', 'braceR', 'fortifications', 'scaffold'])
// Goods, characters, fire, smoke and service lights are operational, not structure.
const finishing = new Set(['doors', 'metal', 'props', 'cloth', 'barrels', 'sacks', 'baskets', 'logs', 'cartWheel', 'ore'])
const ramp = (ratio: number, start: number, end: number): number => Math.max(0, Math.min(1, (ratio - start) / (end - start)))

export function constructionPartFraction(name: string, y: number, sx: number, sy: number, sz: number, ratio: number): number {
  if (ratio >= 1) return 1
  if (surfaces.has(name)) return 1
  if (name === 'stone') return y - sy / 2 < 0.25 ? ramp(ratio, 0, 0.12) : ramp(ratio, 0.7, 0.9)
  if (name === 'plaster' || name === 'buildings') return ramp(ratio, 0.38, 0.66)
  if (roofs.has(name)) return ramp(ratio, 0.66, 0.9)
  if (name === 'roofFrame') return ramp(ratio,0.32,0.62)
  if (structure.has(name)) {
    // Large wooden wall volumes are infill; actual slender posts/beams precede it.
    if (Math.min(sx, sy, sz) > 0.3) return ramp(ratio, 0.38, 0.66)
    if (sy > Math.max(sx, sz) * 2) return ramp(ratio, 0.08, 0.32)
    return ramp(ratio, 0.12 + Math.min(0.2, y * 0.06), 0.38 + Math.min(0.2, y * 0.06))
  }
  return finishing.has(name) ? ramp(ratio, 0.9, 0.999) : 0
}

/** Reused output fields keep per-piece projection allocation-free. */
export class ConstructionAssembly {
  ratio = 1
  x = 0; y = 0; z = 0; sy = 1; sz = 1

  project(name: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw: number): boolean {
    const fraction = constructionPartFraction(name, y, sx, sy, sz, this.ratio)
    if (fraction <= 0) return false
    this.x = x; this.y = y; this.z = z; this.sy = sy; this.sz = sz
    if (fraction >= 1) return true
    if (roofs.has(name)) {
      // Cover the actual roof progressively along its ridge, retaining its pitch.
      this.sz *= fraction
      const shift = sz * (1 - fraction) / 2
      this.x -= Math.sin(yaw) * shift; this.z -= Math.cos(yaw) * shift
    } else {
      // Erect posts and wall panels from their existing base rather than floating.
      this.sy *= fraction; this.y -= sy * (1 - fraction) / 2
    }
    return true
  }
}
