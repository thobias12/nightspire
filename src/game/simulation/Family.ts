import { entrance } from './Navigation'
import { MAX_SETTLERS, recordEvent, spawnSettler, type FamilyState, type Settler, type WorldState } from './WorldState'

export const CHILD_DAYS_PER_YEAR = 6
export const FAMILY_CHILD_INTERVAL_DAYS = 6
export const MAX_DEPENDENT_CHILDREN = 3

const CHILD_NAMES = [
  'Alda', 'Edric', 'Mira', 'Tomas', 'Elin', 'Hugh', 'Nella', 'Oswin',
  'Runa', 'Cedric', 'Ida', 'Wulfric', 'Ansel', 'Freya', 'Bryn', 'Leof',
]

function familyAdults(state: WorldState, family: FamilyState): Settler[] {
  return family.adultIds
    .map(id => state.settlers.find(settler => settler.id === id))
    .filter((settler): settler is Settler => !!settler)
}

function commonHome(adults: Settler[]): number | null {
  const homes = adults.map(adult => adult.homeId).filter((id): id is number => id !== null)
  if (homes.length === 0) return null
  const first = homes[0]
  return homes.every(id => id === first) ? first : null
}

function childName(family: FamilyState, index: number): string {
  return CHILD_NAMES[(family.id + index * 5) % CHILD_NAMES.length]
}

function createFamily(state: WorldState, first: Settler, second: Settler): FamilyState {
  const id = state.nextId++
  const surname = first.familyName
  first.familyId = id
  second.familyId = id
  first.partnerId = second.id
  second.partnerId = first.id
  second.familyName = surname

  const family: FamilyState = {
    id,
    surname,
    adultIds: [first.id, second.id],
    children: [],
    homeId: first.homeId === second.homeId ? first.homeId : null,
    formedDay: state.day,
    lastChildDay: state.day,
  }

  // Some newly-formed households begin with an existing dependent child so the
  // family layer is visible immediately instead of requiring many simulated Days.
  if (family.homeId !== null && id % 2 === 0) {
    family.children.push({
      givenName: childName(family, 0),
      ageYears: 5 + (id % 8),
      ageDays: 0,
    })
  }

  state.families.push(family)
  recordEvent(state, first.givenName + ' and ' + second.givenName + ' formed the ' + surname + ' household.')
  return family
}

export function synchronizeFamilies(state: WorldState): void {
  const settlers = new Set(state.settlers.map(settler => settler.id))

  for (const family of state.families) {
    family.adultIds = family.adultIds.filter(id => settlers.has(id))
    const adults = familyAdults(state, family)
    family.homeId = commonHome(adults)
    for (const adult of adults) {
      adult.familyId = family.id
      adult.familyName = family.surname
    }
  }

  state.families = state.families.filter(family => family.adultIds.length > 0)

  const assigned = new Set(state.families.flatMap(family => family.adultIds))
  for (const settler of state.settlers) {
    if (assigned.has(settler.id)) continue
    settler.familyId = null
    if (settler.partnerId !== null && !settlers.has(settler.partnerId)) settler.partnerId = null
  }

  const houses = new Map<number, Settler[]>()
  for (const settler of state.settlers) {
    if (settler.homeId === null || settler.familyId !== null) continue
    const residents = houses.get(settler.homeId) ?? []
    residents.push(settler)
    houses.set(settler.homeId, residents)
  }

  for (const residents of houses.values()) {
    residents.sort((a, b) => a.id - b.id)
    while (residents.length >= 2) {
      const first = residents.shift()!
      const second = residents.shift()!
      createFamily(state, first, second)
    }
  }
}

function growChildIntoSettler(state: WorldState, family: FamilyState, childIndex: number): boolean {
  if (state.settlers.length >= MAX_SETTLERS || family.homeId === null) return false
  const child = family.children[childIndex]
  const home = state.buildings.find(building => building.id === family.homeId && building.complete && !building.destroyed)
  if (!home) return false

  const spawn = entrance(home)
  if (!spawnSettler(state, spawn, null)) return false
  const adult = state.settlers.at(-1)!
  adult.givenName = child.givenName
  adult.familyName = family.surname
  adult.ageYears = Math.max(16, child.ageYears)
  adult.familyId = family.id
  adult.partnerId = null
  adult.homeId = family.homeId
  adult.status = 'Newly of age — needs work'
  family.adultIds.push(adult.id)
  family.children.splice(childIndex, 1)
  recordEvent(state, adult.givenName + ' ' + adult.familyName + ' came of age and joined the labor pool.')
  return true
}

export interface FamilyDayResult {
  formed: number
  births: number
  matured: number
}

export function processFamiliesDay(state: WorldState): FamilyDayResult {
  const before = state.families.length
  synchronizeFamilies(state)
  let births = 0
  let matured = 0

  for (const settler of state.settlers) {
    if ((state.day + settler.id) % CHILD_DAYS_PER_YEAR === 0) settler.ageYears++
  }

  for (const family of state.families) {
    for (let i = family.children.length - 1; i >= 0; i--) {
      const child = family.children[i]
      child.ageDays++
      if (child.ageDays >= CHILD_DAYS_PER_YEAR) {
        child.ageDays = 0
        child.ageYears++
      }
      if (child.ageYears >= 16 && growChildIntoSettler(state, family, i)) matured++
    }

    const adults = familyAdults(state, family)
    const coupledAdults = adults.filter(adult => adult.partnerId !== null)
    const canGrow = family.homeId !== null
      && coupledAdults.length >= 2
      && family.children.length < MAX_DEPENDENT_CHILDREN
      && state.day - family.lastChildDay >= FAMILY_CHILD_INTERVAL_DAYS

    if (canGrow) {
      family.children.push({
        givenName: childName(family, family.children.length),
        ageYears: 0,
        ageDays: 0,
      })
      family.lastChildDay = state.day
      births++
      recordEvent(state, 'A child was born into the ' + family.surname + ' household.')
    }
  }

  synchronizeFamilies(state)
  return { formed: Math.max(0, state.families.length - before), births, matured }
}

export function familyForSettler(state: WorldState, settler: Settler): FamilyState | null {
  return settler.familyId === null ? null : state.families.find(family => family.id === settler.familyId) ?? null
}

export function familySummary(state: WorldState): {
  families: number
  couples: number
  children: number
  averageAge: number
} {
  const adults = state.settlers.length
  return {
    families: state.families.length,
    couples: state.families.filter(family => family.adultIds.length >= 2).length,
    children: state.families.reduce((sum, family) => sum + family.children.length, 0),
    averageAge: adults > 0
      ? Math.round(state.settlers.reduce((sum, settler) => sum + settler.ageYears, 0) / adults)
      : 0,
  }
}
