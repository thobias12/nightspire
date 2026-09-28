// Run npm test first to compile the renderer-independent modules.
import { createRequire } from 'node:module'
import { performance } from 'node:perf_hooks'
const require = createRequire(import.meta.url)
const { createGeneratedWorld } = require('../.test-build/game/domain/world/MapGenerator.js')
const { RegionalRouter, regionalReachability } = require('../.test-build/game/domain/world/RegionalNavigation.js')
const measure = (work, count = 30) => {
  for (let i = 0; i < 5; i++) work()
  const times = []
  for (let i = 0; i < count; i++) { const start = performance.now(); work(); times.push(performance.now() - start) }
  times.sort((a, b) => a - b)
  return { medianMs: +times[Math.floor(count / 2)].toFixed(3), p95Ms: +times[Math.min(count - 1, Math.floor(count * 0.95))].toFixed(3) }
}
const rows = [129, 257, 513].map(size => {
  const half = (size - 1) / 2, router = new RegionalRouter(half), blocked = new Set()
  return {
    size, seed: 42, landscape: 'woodland', nodes: createGeneratedWorld(42, size, 'woodland').nodes.length,
    generation: measure(() => createGeneratedWorld(42, size, 'woodland')),
    localRoute: measure(() => router.route({ x: 0, z: 0 }, { x: 10, z: 5 }, blocked)),
    spanningRoute: measure(() => router.route({ x: -half + 1, z: -half + 1 }, { x: half - 1, z: half - 1 }, blocked)),
    connectivity: measure(() => regionalReachability({ x: 0, z: 2 }, blocked, half)),
  }
})
console.log(JSON.stringify({ node: process.version, platform: process.platform, samples: 30, warmups: 5, rows }, null, 2))
