import { BUILDINGS, type BuildingId } from '../data/buildings'
import { assignHousing } from '../simulation/Buildings'
import { blockedCells, cellKey, entrance, flood, MAP_MIN, MAP_MAX } from '../simulation/Navigation'
import { createBuilding, createInitialWorldState, type WorldState } from '../simulation/WorldState'

export const BENCHMARK_VERSION = 3
export const POPULATIONS = [10, 100, 250, 500, 1000] as const
export type Workload = 'logistics' | 'services' | 'idle'
export const WORKLOADS: Workload[] = ['logistics', 'services', 'idle']
export const WARMUP_TICKS = 40
export const SAMPLE_TICKS = 360
export const TOTAL_TICKS = WARMUP_TICKS + SAMPLE_TICKS

// QA-only world factory. It does not change spawnSettler, immigration, save limits or definitions.
export function createBenchmarkWorld(population: number, workload: Workload): WorldState {
  if (!(POPULATIONS as readonly number[]).includes(population) || !WORKLOADS.includes(workload)) throw new Error('Unknown benchmark preset')
  const s = createInitialWorldState()
  const template = s.settlers[0]
  s.settlers = []; s.nodes = []
  s.timeOfDay = workload === 'services' ? 18 / 24 : 8 / 24
  const locations: Array<{ x: number; z: number }> = []
  for (let z = -18; z <= 18; z += 6) for (let x = -18; x <= 18; x += 6) {
    if (x === 0 && z === 0) continue
    locations.push({ x, z })
  }
  const add = (type: BuildingId) => {
    const p = locations.shift()!
    const b = createBuilding(s.nextId++, type, p.x, p.z, true)
    s.buildings.push(b); return b
  }
  const stores = Math.max(2, Math.ceil(population * 10 / 400))
  for (let i = 1; i < stores; i++) add('stockpile')
  for (let i = 0; i < 4; i++) add('house')
  for (let i = 0; i < 4; i++) {
    add('campfire')
    const tavern = add('tavern'); tavern.inventory.ale = BUILDINGS.tavern.service!.supplyCapacity
    const brewery = add('brewery'); brewery.inventory.food = BUILDINGS.brewery.production!.inputCapacity
    if (i < 2) { const smith = add('blacksmith'); smith.inventory.ore = BUILDINGS.blacksmith.production!.inputCapacity }
  }
  // Exercise the current persisted road/plot presentation without changing movement semantics.
  for (const house of s.buildings.filter(b => b.type === 'house')) {
    const road = { id: s.nextId++, width: 1.5,
      points: [{ x: house.x - 3, z: house.z + 2 }, { x: house.x + 3, z: house.z + 2 }] }
    s.roads.push(road)
    s.residentialPlots.push({ id: s.nextId++, buildingId: house.id, roadId: road.id,
      frontageA: { x: house.x - 2, z: house.z + 2 }, frontageB: { x: house.x + 2, z: house.z + 2 },
      depth: 5, side: -1, angle: 0, backyard: 'garden' })
  }
  s.topology++
  const blocked = blockedCells(s)
  const reachable = flood({ x: 0, z: 2 }, blocked)
  const cells: Array<{ x: number; z: number }> = []
  for (let z = MAP_MIN + 1; z < MAP_MAX; z++) for (let x = MAP_MIN + 1; x < MAP_MAX; x++) {
    const inPlot = s.residentialPlots.some(p => x >= p.frontageA.x && x <= p.frontageB.x
      && z <= p.frontageA.z && z >= p.frontageA.z - p.depth)
    if (reachable.has(cellKey({ x, z })) && !inPlot) cells.push({ x, z })
  }
  // Fixed permutation gives identical inputs at each population without RNG or overlapping nodes.
  const shuffled = [...cells]
  let seed = 0x4e535034
  for (let i = shuffled.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const j = seed % (i + 1); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  const nodes = Math.max(60, population)
  for (let i = 0; i < nodes; i++) {
    s.nodes.push({ id: s.nextId++, ...shuffled[i], resource: i % 5 === 0 ? 'ore' : i % 5 === 1 ? 'food' : 'wood', remaining: 10_000 })
  }
  for (let i = 0; i < population; i++) {
    s.settlers.push({ ...structuredClone(template), id: s.nextId++, ...shuffled[(i * 7) % shuffled.length], lastMealDay: s.day })
  }

  // M3.11 benchmarks retain a large labor pool while staffing enough production slots
  // to exercise the current workplace economy. Assigned workers begin at the door so
  // setup travel does not dominate the short synthetic sample.
  if (workload !== 'idle') {
    let assignable = Math.max(0, population - Math.max(4, Math.ceil(population * 0.7)))
    let workerIndex = 0
    for (const building of s.buildings.filter(b => (BUILDINGS[b.type].workerSlots ?? 0) > 0)) {
      const slots = BUILDINGS[building.type].workerSlots ?? 0
      for (let slot = 0; slot < slots && assignable > 0 && workerIndex < s.settlers.length; slot++) {
        const worker = s.settlers[workerIndex++]
        worker.workplaceId = building.id
        Object.assign(worker, entrance(building))
        worker.status = 'Working as ' + (BUILDINGS[building.type].profession ?? 'Worker') + ' at ' + BUILDINGS[building.type].label
        assignable--
      }
    }
  }

  s.targets = workload === 'idle' ? { wood: 0, food: 0, ale: 0, ore: 0, tools: 0 } : { wood: 10_000, food: 10_000, ore: 10_000, ale: 0, tools: 0 }
  if (workload === 'idle') {
    for (const b of s.buildings) {
      if (b.type === 'tavern') b.inventory.ale = 12
      if (b.type === 'brewery') { b.inventory.food = 20; b.inventory.ale = 24 }
    }
    // Remove possible automatic logistics demand, retaining buildings/needs/render load.
    s.buildings = s.buildings.filter(b => b.type !== 'brewery' && b.type !== 'tavern' && b.type !== 'blacksmith')
    s.topology++
  }
  assignHousing(s)
  s.events = ['M4 synthetic ' + workload + ' workload. Normal gameplay caps are unchanged.']
  return s
}
export function stateDigest(state: WorldState): string {
  // Neutral default workforce fields are omitted so historical M4 starting digests remain comparable.
  const text = JSON.stringify(state, (key, value) => key === 'workplaceId' && value === null ? undefined : value)
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619)
  return (hash >>> 0).toString(16).padStart(8, '0')
}
