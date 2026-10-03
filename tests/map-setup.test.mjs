import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require=createRequire(import.meta.url)
const { createGeneratedWorld,forestDensity,MAX_MAP_NODES }=require('../.test-build/game/world/MapGenerator.js')
const { terrainBlocked,terrainWater,waterDistance,mapLakes,riverCenter,terrainRouteError,terrainPolygonError }=require('../.test-build/game/world/MapTerrain.js')
const { blockedCells,cellKey,Navigation }=require('../.test-build/game/world/Navigation.js')
const { regionalReachability,RegionalRouter }=require('../.test-build/game/world/RegionalNavigation.js')
const { placementError }=require('../.test-build/game/systems/construction/Buildings.js')
const { serializeWorld,deserializeWorld,validateWorld }=require('../.test-build/game/persistence/SaveLoad.js')
const { mapIllustration }=require('../.test-build/game/ui/MapIllustration.js')
const { waterSurfacePositions }=require('../.test-build/game/render/RegionalWater.js')
const { createMeadowField }=require('../.test-build/game/render/RoadSurface.js')
const { roadPlacementError,residentialPlotError }=require('../.test-build/game/world/TownPlanning.js')
const { fieldPlacementError }=require('../.test-build/game/world/FieldPlanning.js')
const { Simulation }=require('../.test-build/game/runtime/Simulation.js')

test('four V2 layouts are repeatable, bounded, distinct, connected and provisioned across seeds/sizes',()=>{
  for(const size of [129,257,513])for(const seed of [0,137,0xffffffff])for(const landscape of ['meadows','woodland','riverlands','lakeland']){
    const s=createGeneratedWorld(seed,size,landscape,2),h=(size-1)/2
    assert.deepEqual(s,createGeneratedWorld(seed,size,landscape,2))
    assert.ok(s.nodes.length<=MAX_MAP_NODES)
    assert.equal(new Set(s.nodes.map(cellKey)).size,s.nodes.length)
    assert.ok(s.nodes.every(n=>!terrainWater(n.x,n.z,s.map)))
    assert.ok(s.nodes.filter(n=>n.resource==='wood').every(n=>waterDistance(n.x,n.z,s.map)>=4))
    for(const [resource,count]of [['wood',40],['food',20],['ore',12]])assert.ok(s.nodes.filter(n=>n.resource===resource&&Math.hypot(n.x,n.z)<33).length>=count,`${size}/${seed}/${landscape}/${resource}`)
    const reachable=regionalReachability({x:0,z:2},blockedCells(s),h)
    assert.ok(s.nodes.every(n=>reachable.has(cellKey(n))),`${size}/${seed}/${landscape}: disconnected node`)
    assert.equal(forestDensity(0,0,s.map),0)
    assert.deepEqual(deserializeWorld(serializeWorld(s)),s)
  }
  const meadows=createGeneratedWorld(137,513,'meadows',2)
  assert.notDeepEqual(meadows.nodes,createGeneratedWorld(137,513,'woodland',2).nodes)
  assert.throws(()=>createGeneratedWorld(1,513,'unknown',2))
})

test('river routing detours through a ford, shares cached water blockers, and retains global budget',()=>{
  const s=createGeneratedWorld(137,257,'riverlands',2),map=s.map,z=20,x=Math.round(riverCenter(z,map))
  const terrain=terrainBlocked(map)
  assert.equal(terrainBlocked(map),terrain)
  assert.ok(terrain.has(cellKey({x,z})))
  assert.equal(placementError(s,'stockpile',{x,z}),'Build on dry land, away from water.')
  const router=new RegionalRouter(128),route=router.route({x:x-8,z},{x:x+8,z},terrain)
  assert.ok(route&&route.length>17)
  assert.ok(route.every(p=>!terrain.has(cellKey(p))))
  assert.ok(route.some(p=>Math.abs(p.z)<3))
  const nav=new Navigation();nav.sync(s)
  assert.equal(nav.walkable({x,z}),false)
  for(const a of s.settlers)nav.request(a.id,{x:x+8,z},0)
  nav.process(s);assert.equal(nav.solved,2);assert.equal(nav.depth,4)
  const copy=blockedCells(s);copy.clear();assert.ok(terrainBlocked(map).size>0)
})

test('water rejects roads, parcels and fields at edges and inside otherwise dry polygons',()=>{
  const s=createGeneratedWorld(137,257,'riverlands',2),map=s.map,z=20,x=riverCenter(z,map)
  const road=[{x:x-8,z},{x:x+8,z}]
  assert.match(roadPlacementError(road,[],128,map,2.4),/dry land/)
  const ford=riverCenter(0,map)
  assert.equal(terrainRouteError([{x:ford-8,z:0},{x:ford+8,z:0}],map,2.4),null)
  const points=[{x:x-4,z:z-4},{x:x+4,z:z-4},{x:x+4,z:z+4},{x:x-4,z:z+4}]
  assert.match(terrainPolygonError(points,map),/dry land/)
  assert.match(fieldPlacementError(points,[],[],[],[],[],128,map),/dry land/)
  assert.match(residentialPlotError({frontageA:{x:x-3,z:18},frontageB:{x:x+3,z:18},width:6,depth:8,side:1},[],128,map),/dry land/)
  const lake=createGeneratedWorld(0,257,'lakeland',2).map
  assert.match(terrainPolygonError([{x:-110,z:-110},{x:0,z:-110},{x:0,z:0},{x:-110,z:0}],lake),/dry land/)
})

test('save validation rejects forged water placement and invalid map metadata',()=>{
  const s=createGeneratedWorld(137,257,'riverlands',2)
  s.roads.push({id:s.nextId++,width:2.4,points:[{x:riverCenter(20,s.map)-10,z:20},{x:riverCenter(20,s.map)+10,z:20}]})
  assert.throws(()=>validateWorld(s),/road on water/)
  s.roads=[];s.map.version=3;assert.throws(()=>validateWorld(s),/map definition/)
})

test('cartography, water surface and terrain color share seeds and stay bounded',()=>{
  for(const landscape of ['meadows','woodland','riverlands','lakeland']){
    const s=createGeneratedWorld(137,513,landscape,2),saved=JSON.stringify(s)
    const art=mapIllustration(s)
    assert.equal(art,mapIllustration(s));assert.ok(art.length<240000)
    assert.ok(!/NaN|Infinity/.test(art));assert.match(art,/Starting camp/)
    const positions=waterSurfacePositions(s.map)
    assert.ok(positions.length/9<=512)
    assert.ok(positions.every(Number.isFinite));assert.deepEqual(positions,waterSurfacePositions(s.map))
    const field=createMeadowField(533,64,s.map)
    assert.equal(field.pixels.length,64*64*4);assert.deepEqual(field,createMeadowField(533,64,s.map))
    assert.equal(JSON.stringify(s),saved)
  }
  assert.notEqual(mapIllustration(createGeneratedWorld(1,257,'riverlands',2)),mapIllustration(createGeneratedWorld(2,257,'riverlands',2)))
})

test('fresh river/lake camps retain existing gathering, cargo and depositing gameplay',()=>{
  for(const landscape of ['riverlands','lakeland']){
    const s=createGeneratedWorld(137,129,landscape,2),sim=new Simulation(s)
    for(let i=0;i<1800;i++){s.timeOfDay=0.4;sim.step()}
    assert.ok(s.totals.deposited.wood>0);assert.ok(s.totals.deposited.food>0)
    assert.ok(s.settlers.every(a=>!terrainWater(Math.round(a.x),Math.round(a.z),s.map)))
    validateWorld(s)
  }
})


test('regional raids move water-covered approach points onto dry banks',()=>{
  const { spawnNightRaid }=require('../.test-build/game/systems/combat/Raid.js')
  for(const landscape of ['riverlands','lakeland']){
    const s=createGeneratedWorld(137,129,landscape,2)
    const p=landscape==='riverlands'?{x:riverCenter(20,s.map),z:20}:mapLakes(s.map)[0]
    const sign=Math.sign(p.x)
    Object.assign(s.buildings[0],{x:Math.round(p.x-sign*23),z:Math.round(p.z)})
    s.raid.wave=sign>0?1:3
    assert.ok(spawnNightRaid(s)>0)
    const water=terrainBlocked(s.map)
    assert.ok(s.enemies.every(e=>!water.has(cellKey(e))))
  }
})
