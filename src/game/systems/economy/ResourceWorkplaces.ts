import { BUILDINGS } from '../../data/buildings'
import { waterDistance } from '../../world/MapTerrain'
import { WOODCUTTING } from '../../data/resources'
import type { DayPhase } from '../../runtime/DayNight'
import { MAX_MAP_NODES, mapHash, worldHalf } from '../../world/MapGenerator'
import { distance } from '../../world/Navigation'
import { workplaceStaffing } from '../population/Workforce'
import { recordEvent, type Building, type ResourceNode, type WorldState } from '../../model/WorldState'

export const FORESTER_TREE_TARGET = 18
export const SAPLING_GROWTH_PER_DAY = 0.25
export const SAPLINGS_PER_LODGE_PER_DAY = 2

const activeOperation = (building: Building) => BUILDINGS[building.type].resourceOperation

function operationNode(state: WorldState, building: Building, resource: 'wood' | 'ore', radius: number): ResourceNode | null {
  return state.nodes
    .filter(node => node.resource === resource && node.remaining > 0 && distance(node, building) <= radius)
    .sort((a, b) => distance(a, building) - distance(b, building) || a.id - b.id)[0] ?? null
}

export function updateResourceWorkplaces(state: WorldState, delta: number, phase: DayPhase): void {
  for (const building of state.buildings) {
    const operation = activeOperation(building)
    if (!operation || !building.complete || building.destroyed) continue
    // Foresters now create ordinary gather jobs so their workers physically travel,
    // fell the tree, return timber to the lodge buffer, and let haulers move it onward.
    if (building.type === 'foresters-lodge') continue
    if (phase !== 'day') continue

    const staffing = workplaceStaffing(state, building)
    if (staffing.active <= 0) continue
    if (building.inventory[operation.resource] >= operation.outputCapacity) continue

    let node: ResourceNode | null = null
    if (!operation.renewable) {
      node = operationNode(state, building, operation.resource as 'wood' | 'ore', operation.radius)
      if (!node) continue
    }

    building.productionProgress += delta * staffing.efficiency
    while (
      building.productionProgress + 1e-8 >= operation.cycleSeconds
      && building.inventory[operation.resource] < operation.outputCapacity
    ) {
      if (!operation.renewable) {
        node = operationNode(state, building, operation.resource as 'wood' | 'ore', operation.radius)
        if (!node) break
        node.remaining--
        if (node.resource === 'wood' && node.remaining <= 0 && node.planted) node.growth = 0
      }

      building.productionProgress -= operation.cycleSeconds
      building.inventory[operation.resource]++
      state.totals.gathered[operation.resource]++

      if (!operation.renewable && node && node.remaining <= 0) {
        recordEvent(state, BUILDINGS[building.type].label + ' exhausted a nearby ' + (operation.resource === 'wood' ? 'tree stand.' : 'ore deposit.'))
      }
    }
  }
}

function clearForSapling(state: WorldState, x: number, z: number): boolean {
  if (waterDistance(x,z,state.map) < 4) return false
  if (Math.abs(x) >= worldHalf(state) - 2 || Math.abs(z) >= worldHalf(state) - 2) return false
  if (state.nodes.some(node => Math.hypot(node.x - x, node.z - z) < 2.2 && (node.remaining > 0 || (node.planted && (node.growth ?? 0) > 0)))) return false
  if (state.buildings.some(building => !building.destroyed && Math.hypot(building.x - x, building.z - z) < 3.2)) return false
  return true
}

function plantSapling(state: WorldState, lodge: Building, slot: number): boolean {
  const operation = BUILDINGS[lodge.type].resourceOperation!
  const dead = state.nodes.find(node =>
    node.resource === 'wood' && node.remaining <= 0 && distance(node, lodge) <= operation.radius && !node.planted,
  )
  if (dead) {
    dead.planted = true
    dead.growth = 0.15
    return true
  }

  if (state.nodes.length >= MAX_MAP_NODES) return false
  for (let attempt = 0; attempt < 18; attempt++) {
    const seed = state.day * 97 + lodge.id * 131 + slot * 31 + attempt
    const angle = mapHash(seed, lodge.id, state.map?.seed ?? 137) * Math.PI * 2
    const radius = 8 + mapHash(seed, lodge.id + 19, (state.map?.seed ?? 137) + 41) * Math.max(4, operation.radius - 9)
    const x = Math.round(lodge.x + Math.cos(angle) * radius)
    const z = Math.round(lodge.z + Math.sin(angle) * radius)
    if (!clearForSapling(state, x, z)) continue
    state.nodes.push({ id: state.nextId++, x, z, resource: 'wood', remaining: 0, planted: true, growth: 0.15 })
    return true
  }
  return false
}

export function processForestryDay(state: WorldState): void {
  let matured = 0
  for (const node of state.nodes) {
    if (node.resource !== 'wood' || !node.planted || node.remaining > 0) continue
    node.growth = Math.min(1, (node.growth ?? 0) + SAPLING_GROWTH_PER_DAY)
    if (node.growth >= 1) {
      node.remaining = WOODCUTTING.managedTreeYield
      matured++
    }
  }

  let planted = 0
  const lodges = state.buildings.filter(building =>
    building.type === 'foresters-lodge' && building.complete && !building.destroyed,
  )
  for (const lodge of lodges) {
    const operation = BUILDINGS[lodge.type].resourceOperation!
    const managed = state.nodes.filter(node =>
      node.resource === 'wood'
      && distance(node, lodge) <= operation.radius
      && (node.remaining > 0 || (node.planted && (node.growth ?? 0) > 0)),
    ).length
    const allowance = Math.min(SAPLINGS_PER_LODGE_PER_DAY, Math.max(0, FORESTER_TREE_TARGET - managed))
    for (let i = 0; i < allowance; i++) if (plantSapling(state, lodge, i)) planted++
  }

  if (matured > 0) recordEvent(state, matured + ' managed tree' + (matured === 1 ? '' : 's') + ' matured into harvestable timber.')
  if (planted > 0) recordEvent(state, 'Foresters planted ' + planted + ' new sapling' + (planted === 1 ? '' : 's') + '.')
}
