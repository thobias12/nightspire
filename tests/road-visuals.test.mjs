import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { createRoadSurface, roadCoverageAt, roadWearProfile, ROAD_GRASS_LIMIT, ROAD_STONE_LIMIT } = require('../.test-build/game/render/RoadSurface.js')
const road = (id, width, points) => ({ id, width, points: points.map(([x,z]) => ({ x,z })) })
const horizontal = road(41, 1.7, [[-10,0],[10,0]])

test('terrain cache reuses unchanged saves and rebuilds for width, point and removal edits', () => {
  const { RoadTerrain } = require('../.test-build/game/render/RoadTerrain.js')
  const terrain = new RoadTerrain(67), roads = [structuredClone(horizontal)]
  terrain.update(roads)
  const first = terrain.surface
  terrain.update(structuredClone(roads))
  assert.equal(terrain.surface,first)
  roads[0].width = 2.4; terrain.update(roads)
  assert.notEqual(terrain.surface,first)
  const second = terrain.surface
  roads[0].points[0].z = 2; terrain.update(roads)
  assert.notEqual(terrain.surface,second)
  terrain.update([])
  assert.equal(terrain.surface.coverage.some(v=>v>0),false)
  terrain.dispose()
})

test('road albedo and dressing regenerate deterministically without changing saved roads', () => {
  const roads = [horizontal, road(7, 2.4, [[0,-10],[0,10]])], saved = JSON.stringify(roads)
  assert.deepEqual(createRoadSurface(roads, 32, 256), createRoadSurface(JSON.parse(saved), 32, 256))
  assert.equal(JSON.stringify(roads), saved)
})
test('width drives path compaction, lane center grass and main-road traffic without changing widths', () => {
  const path = roadWearProfile(1.2), lane = roadWearProfile(1.7), main = roadWearProfile(2.4)
  assert.ok(path.compaction < lane.compaction && lane.compaction < main.compaction)
  assert.equal(path.wheelTracks, 0)
  assert.ok(lane.centerGrass > path.centerGrass && lane.centerGrass > main.centerGrass)
  for (const width of [1.2,1.7,2.4]) {
    const s = createRoadSurface([road(41,width,[[-10,0],[10,0]])],32,256)
    assert.ok(roadCoverageAt(s,0,0) > 0.95)
    assert.equal(roadCoverageAt(s,0,width/2+1),0)
  }
})
test('crossings and Y joins use order-independent opaque union, with no stacked darkness', () => {
  const roads = [horizontal,road(8,1.7,[[0,0],[8,8]]),road(9,2.4,[[0,-10],[0,10]])]
  const a = createRoadSurface(roads,32,256), b = createRoadSurface([...roads].reverse(),32,256)
  assert.deepEqual(a.pixels,b.pixels)
  assert.deepEqual(a.coverage,b.coverage)
  assert.deepEqual(createRoadSurface([...roads,roads[0]],32,256).pixels,a.pixels)
  assert.ok(roadCoverageAt(a,0,0)>0.95)
  assert.ok(a.pixels.every((v,i)=>i%4!==3||v===255))
})
test('inserting collinear junction points does not repeat or reset the surface pattern', () => {
  const a = createRoadSurface([horizontal],32,256)
  const b = createRoadSurface([road(41,1.7,[[-10,0],[-3,0],[0,0],[4,0],[10,0]])],32,256)
  assert.deepEqual(a.pixels,b.pixels)
})
test('curved corridors remain covered through their joins and have soft irregular shoulders', () => {
  const points = Array.from({length:41},(_,i)=>[-10+i/2,Math.sin(i/7)*3])
  const s = createRoadSurface([road(77,1.7,points)],32,256)
  for (const [x,z] of points) assert.ok(roadCoverageAt(s,x,z)>0.9)
  const shoulders = Array.from({length:16},(_,i)=>roadCoverageAt(s,-8+i,Math.sin((i+2)*2/7)*3+0.85))
  assert.ok(shoulders.some(v=>v>0&&v<1))
  assert.ok(new Set(shoulders.map(v=>v.toFixed(2))).size>5)
})
test('dense networks keep texture and instanced dressing budgets bounded', () => {
  const roads = Array.from({length:60},(_,i)=>road(i,2.4,[[-14,-14+i*0.45],[14,-12+i*0.45]]))
  const s = createRoadSurface(roads,32,256)
  assert.equal(s.pixels.length,256*256*4)
  assert.ok(s.grass.length<=ROAD_GRASS_LIMIT)
  assert.ok(s.stones.length<=ROAD_STONE_LIMIT)
  for (const p of [...s.grass,...s.stones]) assert.ok(roadCoverageAt(s,p.x,p.z)<0.79)
  const empty = createRoadSurface([],32,256)
  assert.equal(empty.coverage.some(v=>v>0),false)
  assert.equal(empty.grass.length+empty.stones.length,0)
})
