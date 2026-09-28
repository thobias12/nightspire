import { BUILDINGS, type BuildingId } from '../data/buildings'
import { assignHousing, freeStorage, stockpiles } from '../systems/construction/Buildings'
import { damageBuilding } from '../systems/combat/Combat'
import { forceImmigrationIfEligible } from '../systems/population/Population'
import { createBuilding, spawnSettler, type WorldState } from '../model/WorldState'
import { validateWorld } from '../persistence/SaveLoad'
import { backyardForPlot } from '../world/TownPlanning'

interface QaSimulation {
  setTimeOfDay(value: number): void
}

interface QaRenderer {
  debug: boolean
  mode: 'settlement' | 'follow'
  cinematic: boolean
  focus: { x: number; z: number }
  angle: number
  zoom: number
}

export interface QaActionContext {
  state: WorldState
  selectedId: number | null
  simulation: QaSimulation
  renderer: QaRenderer
}

export type QaActionResult =
  | { handled: false }
  | { handled: true; message?: string; selectedId?: number | null }

const handled = (message?: string, selectedId?: number | null): QaActionResult => ({
  handled: true,
  ...(message === undefined ? {} : { message }),
  ...(selectedId === undefined ? {} : { selectedId }),
})

export function runQaAction(action: string, value: string | undefined, context: QaActionContext): QaActionResult {
  const { state: s, simulation, renderer } = context

  switch (action) {
    case 'time':
      simulation.setTimeOfDay(Number(value) / 24)
      return handled()
    case 'jump-day':
      simulation.setTimeOfDay(12 / 24)
      return handled()
    case 'jump-dusk':
      simulation.setTimeOfDay(18 / 24)
      return handled()
    case 'jump-night':
      simulation.setTimeOfDay(21 / 24)
      return handled()
    case 'jump-dawn':
      simulation.setTimeOfDay(5 / 24)
      return handled()
    case 'next-raid':
      simulation.setTimeOfDay(5 / 24)
      if (s.raid.lastSpawnDay === s.day) s.day++
      simulation.setTimeOfDay(6 / 24)
      simulation.setTimeOfDay(21 / 24)
      return handled('Advanced to raid wave ' + s.raid.wave + '. The new day meal and needs update were processed first.')
    case 'damage-selected': {
      const building = s.buildings.find(b => b.id === context.selectedId && b.complete)
      if (!building) return handled('Select a completed structure first.')
      const destroyed = damageBuilding(s, building, 60)
      assignHousing(s)
      return handled(destroyed
        ? 'QA destroyed the selected fortification. Daylight repair can rebuild it.'
        : 'QA dealt 60 structure damage. Daylight workers will repair it with wood.')
    }
    case 'needs-low':
      for (const settler of s.settlers) settler.needs = { food: 25, housing: 25, safety: 25, recreation: 25 }
      return handled('QA set all settler needs to 25%.')
    case 'needs-reset':
      for (const settler of s.settlers) settler.needs = { food: 100, housing: 100, safety: 100, recreation: 100 }
      return handled('QA reset all settler needs to 100%.')
    case 'immigration-test':
      return handled(forceImmigrationIfEligible(s).message)
    case 'building-supply': {
      const building = s.buildings.find(b => b.id === context.selectedId && b.complete && !b.destroyed)
      if (!building) return handled('Select a completed producer or supplied service building first.')
      const def = BUILDINGS[building.type]
      const resource = def.service?.supplyResource ?? def.production?.inputResource ?? null
      const capacity = def.service?.supplyResource ? def.service.supplyCapacity : def.production?.inputCapacity ?? 0
      if (!resource || capacity <= 0) return handled('Select a completed producer or supplied service building first.')
      const amount = Math.min(5, Math.max(0, capacity - building.inventory[resource]))
      building.inventory[resource] += amount
      return handled(amount > 0
        ? 'QA added ' + amount + ' ' + resource + ' to ' + BUILDINGS[building.type].label + '.'
        : BUILDINGS[building.type].label + ' input storage is already full.')
    }
    case 'paths':
      renderer.debug = value === 'true'
      return handled()
    case 'spawn':
      return handled(spawnSettler(s) ? 'QA settler spawned directly in camp.' : 'M3.3 maximum remains 10 settlers.')
    case 'resources': {
      let added = 0
      for (const resource of ['wood', 'food'] as const) {
        let remaining = 50
        for (const building of stockpiles(s)) {
          const amount = Math.min(remaining, freeStorage(s, building))
          building.inventory[resource] += amount
          remaining -= amount
          added += amount
        }
      }
      return handled('QA added ' + added + ' wood/food within unreserved storage capacity.')
    }
    case 'resources-ore': {
      let remaining = 30
      let added = 0
      for (const building of stockpiles(s)) {
        const amount = Math.min(remaining, freeStorage(s, building))
        building.inventory.ore += amount
        remaining -= amount
        added += amount
      }
      return handled('QA added ' + added + ' Iron Ore within unreserved storage capacity.')
    }
    case 'town-visual': {
      if (s.buildings.some(building => !(building.type === 'stockpile' && building.x === 0 && building.z === 0))) {
        return handled('Town Center visual target is available on a fresh settlement only.')
      }

      const starter = s.buildings.find(building => building.type === 'stockpile' && building.x === 0 && building.z === 0)!
      starter.inventory.wood = 220
      starter.inventory.food = 120
      starter.inventory.ale = 8
      starter.inventory.ore = 18
      starter.inventory.tools = 3

      const plan: Array<[BuildingId, number, number, number]> = [
        ['house', -7, -3, 0],
        ['house', 7, -3, 0],
        ['house', 0, -8, 0],
        ['tavern', -5, 5, 1],
        ['blacksmith', 5, 5, 3],
        ['campfire', 0, 4, 0],
        ['guard-post', 0, 9, 2],
        ['wood-wall', -4, 12, 1],
        ['wood-wall', -3, 12, 1],
        ['wood-wall', -2, 12, 1],
        ['wood-wall', -1, 12, 1],
        ['wood-gate', 0, 12, 1],
        ['wood-wall', 1, 12, 1],
        ['wood-wall', 2, 12, 1],
        ['wood-wall', 3, 12, 1],
        ['wood-wall', 4, 12, 1],
      ]
      const built = plan.map(([type, x, z, rotation]) => createBuilding(s.nextId++, type, x, z, true, rotation))
      const tavern = built.find(building => building.type === 'tavern')!
      const smith = built.find(building => building.type === 'blacksmith')!
      tavern.inventory.ale = 12
      smith.inventory.ore = 12
      s.buildings.push(...built)

      const mainRoadId = s.nextId++
      const southRoadId = s.nextId++
      const lowerRoadId = s.nextId++
      s.roads.push(
        { id: mainRoadId, width: 1.7, points: [{ x: -11, z: 0 }, { x: -6, z: 0.2 }, { x: 0, z: 0 }, { x: 6, z: 0.15 }, { x: 11, z: 0 }] },
        { id: southRoadId, width: 1.7, points: [{ x: 0, z: 0 }, { x: 0.2, z: -2.5 }, { x: 0, z: -5 }] },
        { id: lowerRoadId, width: 1.65, points: [{ x: -4, z: -5 }, { x: 0, z: -5 }, { x: 4, z: -5 }] },
      )
      const houses = built.filter(building => building.type === 'house')
      const plotSpecs = [
        { buildingId: houses[0].id, roadId: mainRoadId, frontageA: { x: -9, z: 0 }, frontageB: { x: -5, z: 0 }, depth: 6, side: -1 as const, angle: 0 },
        { buildingId: houses[1].id, roadId: mainRoadId, frontageA: { x: 5, z: 0 }, frontageB: { x: 9, z: 0 }, depth: 6, side: -1 as const, angle: 0 },
        { buildingId: houses[2].id, roadId: lowerRoadId, frontageA: { x: -2.25, z: -5 }, frontageB: { x: 2.25, z: -5 }, depth: 6.5, side: -1 as const, angle: 0 },
      ]
      for (const spec of plotSpecs) {
        const plotId = s.nextId++
        s.residentialPlots.push({ id: plotId, ...spec, backyard: backyardForPlot(plotId, spec.depth) })
      }

      const clearSites = [{ x: 0, z: 0 }, ...built.map(building => ({ x: building.x, z: building.z }))]
      for (const node of s.nodes) {
        if (clearSites.some(site => Math.hypot(site.x - node.x, site.z - node.z) < 3.1)) node.remaining = 0
      }
      s.topology++
      assignHousing(s)
      s.timeOfDay = 17.5 / 24
      renderer.mode = 'settlement'
      renderer.cinematic = true
      renderer.focus.x = 0
      renderer.focus.z = 2
      renderer.angle = 0.62
      renderer.zoom = 23
      return handled(
        'M3.8.1 Town Center staged with player-road data and modular residential plots. Use 0 Road / 1 Residential Plot on a fresh run to test the actual tools.',
        tavern.id,
      )
    }
    case 'audit':
      validateWorld(s)
      return handled('State integrity PASS: population attraction, needs, Ore/Tools production, services, raids, reservations and connectivity.')
    default:
      return { handled: false }
  }
}
