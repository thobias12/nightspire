export function mapHash(x: number, z: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(seed, 1274126177)
  h = Math.imul(h ^ h >>> 13, 1274126177)
  return ((h ^ h >>> 16) >>> 0) / 4294967296
}
export function landscapeNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x), iz = Math.floor(z), smooth = (t: number) => t * t * (3 - 2 * t)
  const tx = smooth(x - ix), tz = smooth(z - iz)
  const a = mapHash(ix, iz, seed), b = mapHash(ix + 1, iz, seed)
  const c = mapHash(ix, iz + 1, seed), d = mapHash(ix + 1, iz + 1, seed)
  return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz
}
