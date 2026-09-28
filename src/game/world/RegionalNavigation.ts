import type { Point } from '../model/WorldState'
import { cellKey } from './Grid'

/** One reusable A* workspace per shared navigation service, never per citizen. */
export class RegionalRouter {
  private readonly cost: Int32Array
  private readonly parent: Int32Array
  private readonly seen: Uint32Array
  private readonly closed: Uint32Array
  private stamp = 0
  private heap: number[] = []
  visited = 0
  constructor(private half: number) {
    const count = (half * 2 + 1) ** 2
    this.cost = new Int32Array(count); this.parent = new Int32Array(count)
    this.seen = new Uint32Array(count); this.closed = new Uint32Array(count)
  }
  route(from: Point, target: Point, blocked: Set<number>): Point[] | null {
    const half = this.half, size = half * 2 + 1
    const sx = Math.round(from.x), sz = Math.round(from.z), tx = Math.round(target.x), tz = Math.round(target.z)
    this.visited = 0
    if ([sx, sz, tx, tz].some(v => Math.abs(v) > half) || blocked.has(cellKey({ x: sx, z: sz }))
      || blocked.has(cellKey({ x: tx, z: tz }))) return null
    if (++this.stamp === 0xffffffff) { this.seen.fill(0); this.closed.fill(0); this.stamp = 1 }
    const stamp = this.stamp, start = (sz + half) * size + sx + half, end = (tz + half) * size + tx + half
    const h = (key: number) => Math.abs(key % size - half - tx) + Math.abs(Math.floor(key / size) - half - tz)
    // Immutable packed priorities keep decrease-key insertions heap-safe.
    // Maximum packed value stays below Number.MAX_SAFE_INTEGER at 513 cells.
    const count = size * size
    const less = (a: number, b: number) => a < b
    const push = (node: number) => {
      const heuristic = h(node)
      const key = ((this.cost[node] + heuristic) * (half * 4 + 1) + heuristic) * count + node
      let i = this.heap.length; this.heap.push(key)
      while (i > 0) { const p = (i - 1) >> 1; if (!less(key, this.heap[p])) break; this.heap[i] = this.heap[p]; i = p }
      this.heap[i] = key
    }
    const pop = () => {
      const result = this.heap[0], last = this.heap.pop()!
      if (this.heap.length) {
        let i = 0
        while (i * 2 + 1 < this.heap.length) {
          let child = i * 2 + 1
          if (child + 1 < this.heap.length && less(this.heap[child + 1], this.heap[child])) child++
          if (!less(this.heap[child], last)) break
          this.heap[i] = this.heap[child]; i = child
        }
        this.heap[i] = last
      }
      return result % count
    }
    this.heap.length = 0; this.seen[start] = stamp; this.cost[start] = 0; this.parent[start] = -1; push(start)
    while (this.heap.length) {
      const key = pop()
      if (this.closed[key] === stamp) continue
      this.closed[key] = stamp; this.visited++
      if (key === end) {
        const path: Point[] = []
        for (let k = key; k !== -1; k = this.parent[k]) path.push({ x: k % size - half, z: Math.floor(k / size) - half })
        return path.reverse()
      }
      const x = key % size, z = Math.floor(key / size)
      for (let d = 0; d < 4; d++) {
        const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0), nz = z + (d === 2 ? 1 : d === 3 ? -1 : 0)
        if (nx < 0 || nx >= size || nz < 0 || nz >= size) continue
        const next = nz * size + nx
        if (this.closed[next] === stamp || blocked.has(cellKey({ x: nx - half, z: nz - half }))) continue
        const cost = this.cost[key] + 1
        if (this.seen[next] === stamp && this.cost[next] <= cost) continue
        this.seen[next] = stamp; this.cost[next] = cost; this.parent[next] = key; push(next)
      }
    }
    return null
  }
}

/** Connectivity checks need a flood, but not hundreds of thousands of objects. */
export function regionalReachability(start: Point, blocked: Set<number>, half: number): { has(key: number): boolean } {
  const size = half * 2 + 1, visited = new Uint8Array(size * size), queue = new Int32Array(size * size)
  const sx = Math.round(start.x), sz = Math.round(start.z)
  let read = 0, write = 0
  if (Math.abs(sx) <= half && Math.abs(sz) <= half && !blocked.has(cellKey(start))) {
    const key = (sz + half) * size + sx + half
    visited[key] = 1; queue[write++] = key
  }
  while (read < write) {
    const key = queue[read++], x = key % size, z = Math.floor(key / size)
    for (let d = 0; d < 4; d++) {
      const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0), nz = z + (d === 2 ? 1 : d === 3 ? -1 : 0)
      if (nx < 0 || nx >= size || nz < 0 || nz >= size) continue
      const next = nz * size + nx
      if (visited[next] || blocked.has(cellKey({ x: nx - half, z: nz - half }))) continue
      visited[next] = 1; queue[write++] = next
    }
  }
  return { has(key) {
    const x = key % 1025 - 512, z = Math.floor(key / 1025) - 512
    return Math.abs(x) <= half && Math.abs(z) <= half && visited[(z + half) * size + x + half] === 1
  } }
}
