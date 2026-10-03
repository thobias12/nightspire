import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
const require = createRequire(import.meta.url)
const { ConstructionAssembly, constructionRatio, assemblyStage, constructionPartFraction } = require('../.test-build/game/render/BuildingConstructionPresentation.js')
const { buildingDamageVisualStage } = require('../.test-build/game/render/VisualState.js')
const { TownBuildingRenderer } = require('../.test-build/game/render/TownBuildingRenderer.js')
const { TradeBuildingRenderer } = require('../.test-build/game/render/TradeBuildingRenderer.js')
const { createGarmentGeometry, createLimbGeometry, addRoofUvs } = require('../.test-build/game/render/GroundedGeometry.js')
const { createWeatheredGableRoofGeometry } = require('../.test-build/game/render/RenderPrimitives.js')
const { createBuilding } = require('../.test-build/game/model/WorldState.js')
const { applyLeafCutout } = require('../.test-build/game/render/LeafCutout.js')
const THREE = require('three')
const { BUILDINGS } = require('../.test-build/game/data/buildings.js')
const rotate = (x,z,a) => ({x:x*Math.cos(a)+z*Math.sin(a),z:-x*Math.sin(a)+z*Math.cos(a)})

test('assembly stages follow actual work, clamp invalid inputs, and do not complete prematurely', () => {
  assert.equal(constructionRatio(-1,100,false),0)
  assert.equal(constructionRatio(1,0,false),0)
  assert.equal(constructionRatio(NaN,100,false),0)
  assert.equal(constructionRatio(100,100,false),0.999)
  assert.equal(constructionRatio(0,100,true),1)
  assert.deepEqual([0,.2,.5,.8,.95,1].map(assemblyStage),['foundation','frame','infill','roof','finishing','complete'])
  const b = createBuilding(90,'house',1,2,false)
  assert.equal(b.health,0)
  assert.equal(buildingDamageVisualStage(b),'intact')
  b.destroyed = true; assert.equal(buildingDamageVisualStage(b),'ruin')
  b.complete = true; b.destroyed = false; assert.equal(buildingDamageVisualStage(b),'ruin')
})

test('real posts rise from their base and real pitched roofs extend along rotated ridges', () => {
  const a = new ConstructionAssembly()
  a.ratio = .2
  assert.ok(a.project('timber',7,1.2,9,.1,2,.1,0))
  assert.ok(Math.abs(a.sy-1)<1e-9)
  assert.ok(Math.abs((a.y-a.sy/2)-.2)<1e-9)
  a.ratio = .78
  for (const yaw of [0,Math.PI/2,.37]) {
    assert.ok(a.project('villageRoofs',7,2.4,9,4,2,6,yaw))
    assert.ok(Math.abs(a.sz-3)<1e-9)
    assert.equal(a.sy,2); assert.equal(a.y,2.4)
    assert.ok(Math.abs(a.x-(7-Math.sin(yaw)*1.5))<1e-9)
    assert.ok(Math.abs(a.z-(9-Math.cos(yaw)*1.5))<1e-9)
  }
})

test('unfinished assemblies suppress operational fire, smoke, lights and people', () => {
  for (const name of ['smoke','campfireFire','campfireCore','glow','warmPool','windowGlow','adultTorso','adultBoot','fieldCrop']) {
    assert.equal(constructionPartFraction(name,1,1,1,1,.999),0,name)
    assert.equal(constructionPartFraction(name,1,1,1,1,1),1,name)
  }
  assert.equal(constructionPartFraction('plaster',1,3,2,3,.3),0)
  assert.equal(constructionPartFraction('villageRoofs',2.4,4,2,4,.6),0)
  assert.equal(constructionPartFraction('roofFrame',2.8,2,.1,.1,.65),1)
})

test('finished house parts are identical; earlier phases retain the same base, rotation and state', () => {
  const calls = [], town = new TownBuildingRenderer((...a)=>calls.push(a),rotate,{})
  const b = createBuilding(91,'house',7,9,true), before = JSON.stringify(b)
  town.renderHouse(b,.37,0xb89973,0,undefined,true,5)
  const assembly = new ConstructionAssembly()
  const project = ratio => {
    assembly.ratio = ratio
    return calls.filter(([n,x,y,z,sx=1,sy=1,sz=1,c,yaw=0])=>assembly.project(n,x,y,z,sx,sy,sz,yaw))
  }
  assert.deepEqual(project(1),calls)
  assert.ok(project(.2).length < project(.5).length)
  assert.ok(project(.5).length < project(.95).length)
  assert.ok(project(.95).length < project(1).length)
  assert.ok(project(.5).some(a=>a[0]==='roofFrame'))
  assert.ok(!project(.5).some(a=>a[0]==='villageRoofs'))
  assert.ok(project(.8).some(a=>a[0]==='villageRoofs'))
  assert.equal(JSON.stringify(b),before)
})

test('every live building family has a bounded deterministic assembly that survives stage projection', () => {
  const calls = [], town = new TownBuildingRenderer((...a)=>calls.push(a),rotate,{})
  const trade = new TradeBuildingRenderer((...a)=>calls.push(a),rotate)
  const methods = {'house':'renderHouse','stockpile':'renderStockpile','guard-post':'renderGuardPost','tavern':'renderTavern',
    'brewery':'renderBrewery','blacksmith':'renderBlacksmith','farmhouse':'renderFarmhouse','foresters-lodge':'renderForestersLodge',
    'mine':'renderMine','ore-yard':'renderOreYard','fishing-hut':'renderFishingHut','pleasure-house':'renderPleasureHouse',
    'wood-wall':'renderFortification','wood-gate':'renderFortification'}
  for (const id of Object.keys(BUILDINGS).filter(id=>id!=='campfire')) {
    const b = createBuilding(100,id,2,3,true), before = JSON.stringify(b)
    const render = () => id==='market'||id==='trading-post' ? trade.render(b,.37) : town[methods[id]](b,.37,0x998877,0,0,0)
    calls.length = 0; render(); const first = structuredClone(calls)
    calls.length = 0; render(); assert.deepEqual(calls,first,id)
    assert.ok(calls.length>0&&calls.length<180,`${id}: ${calls.length}`)
    for (const ratio of [0,.1,.3,.5,.8,.95,1]) {
      const a = new ConstructionAssembly(); a.ratio=ratio
      for (const [name,x,y,z,sx=1,sy=1,sz=1,color,yaw=0] of calls) {
        if (a.project(name,x,y,z,sx,sy,sz,yaw)) assert.ok([a.x,a.y,a.z,a.sy,a.sz].every(Number.isFinite),id)
      }
    }
    assert.equal(JSON.stringify(b),before,id)
  }
})

test('shared garment/limb/roof geometry has finite normals, UVs and bounded triangle counts', () => {
  const geometries = ['tunic','coat','bodice','skirt'].map(createGarmentGeometry)
  geometries.push(createLimbGeometry(true),createLimbGeometry(false),addRoofUvs(createWeatheredGableRoofGeometry()))
  for (const g of geometries) {
    assert.ok((g.index?.count ?? g.getAttribute('position').count)/3 < 300)
    for (const name of ['position','normal','uv']) assert.ok(g.getAttribute(name).array.every(Number.isFinite),name)
    g.dispose()
  }
})

test('leaf cutouts use the same mask for visible surfaces and shadow depth', () => {
  const beauty = new THREE.MeshStandardMaterial(), depth = new THREE.MeshDepthMaterial()
  applyLeafCutout(beauty); applyLeafCutout(depth)
  const compile = material => {
    const shader = {fragmentShader:'#include <map_fragment>'}
    material.onBeforeCompile(shader,{})
    return shader.fragmentShader
  }
  assert.equal(compile(beauty),compile(depth))
  assert.ok(compile(beauty).includes('discard'))
  assert.equal(beauty.transparent,false); assert.equal(depth.transparent,false)
  assert.equal(beauty.depthWrite,true); assert.equal(depth.depthWrite,true)
  beauty.dispose(); depth.dispose()
})

test('plot-profile construction preserves the completed footprint across sizes and arbitrary frontage angles', () => {
  for (const [width,depth] of [[4,11],[6,8],[10,12]]) {
    const calls = [], town = new TownBuildingRenderer((...a)=>calls.push(a),rotate,{})
    const b = createBuilding(119,'house',5,-5,true), angle=.37
    const plot = {id:118,buildingId:119,roadId:1,frontageA:{x:0,z:0},frontageB:rotate(width,0,angle),depth,side:1,angle,backyard:'garden'}
    const saved = JSON.stringify({b,plot})
    town.renderHouse(b,angle,0xb89973,0,plot,false,0)
    const assembly = new ConstructionAssembly(); assembly.ratio = .75
    for (const [name,x,y,z,sx=1,sy=1,sz=1,c,yaw=0] of calls) {
      if (!assembly.project(name,x,y,z,sx,sy,sz,yaw)) continue
      if (name === 'villageRoofs' || name === 'gableRoofs') {
        const shift = sz*(1-assembly.sz/sz)/2
        assert.ok(Math.abs(assembly.x+Math.sin(yaw)*shift-x)<1e-9)
        assert.ok(Math.abs(assembly.z+Math.cos(yaw)*shift-z)<1e-9)
        assert.equal(assembly.sy,sy)
      }
    }
    assert.equal(JSON.stringify({b,plot}),saved)
  }
})

test('shipped models stay self-contained within measured mesh and file budgets', () => {
  const manifest = JSON.parse(readFileSync('assets/world/grounded/manifest.json','utf8'))
  const budgets = {island_tree_01:25000,wine_barrel_01:1400,rock_09:800}
  for (const entry of manifest) {
    const bytes = readFileSync(`assets/world/grounded/${entry.id}.glb`)
    assert.equal(bytes.readUInt32LE(0),0x46546c67)
    assert.equal(bytes.readUInt32LE(8),bytes.length)
    const gltf = JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)))
    const tris = gltf.meshes.reduce((n,m)=>n+m.primitives.reduce((s,p)=>s+gltf.accessors[p.indices].count/3,0),0)
    assert.equal(tris,entry.triangles)
    assert.ok(tris<=budgets[entry.id],entry.id)
    assert.equal(bytes.length,entry.bytes)
    assert.ok(bytes.length<3_000_000)
    assert.ok(gltf.images.every(i=>i.bufferView!==undefined))
    assert.ok(gltf.buffers.every(b=>!b.uri))
    assert.equal(entry.license,'CC0-1.0')
    assert.equal(entry.textureMax,512)
  }
})
