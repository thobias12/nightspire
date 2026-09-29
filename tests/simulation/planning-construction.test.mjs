import * as fixture from './fixture.mjs'
const { DEFAULT_TARGETS, PATH_BUDGET, Simulation, accountedTotal, advance, assert, atmosphereForTime, available, backyardForPlot, blockedCells, buildingPlacementPreview, buildingRequiresRoadFrontage, buildingRoadPlacementError, cancelBuilding, cellKey, constructionVisualStage, createBuilding, createInitialWorldState, damageVisualStage, demolishBuilding, deserializeWorld, entrance, freeStorage, insertRoadJunctionPoint, normalizeRoadPoints, placeBuilding, placeBuildingBatch, placementBatchError, placementError, pop10, require, residentialPlotBuildingError, residentialPlotError, residentialPlotPreview, residentialPlotResourceError, residentialPresentationProfile, roadLength, roadPlacementError, sampleRoadCurve, serializeWorld, snapPointToGrid, snapRoadControlPoint, stockpiles, test, total, validateWorld, visualRoadStrip, wallLinePoints } = fixture

test('residential presentation keeps a 4x11 lot as a long burgage cottage instead of depth-upgrading it', () => {
  const plot={id:106,buildingId:107,roadId:1,frontageA:{x:0,z:0},frontageB:{x:4,z:0},depth:11,side:1,angle:0,backyard:'workyard'}
  const profile=residentialPresentationProfile(plot)
  assert.equal(profile.tier,'cottage')
  assert.equal(profile.form,'long-burgage')
  assert.equal(profile.label,'Long burgage cottage')
  assert.notEqual(profile.sidePassage,0)
  assert.equal(profile.roofFront,'gable')
  assert.equal(profile.frontageStyle,'hedge')
  assert.equal(profile.rearStructure,'workshop')
  assert.equal(profile.courtyard,'none')
  assert.ok(profile.houseWidth<=3.05)
})

test('residential presentation makes a 6x8 plot a balanced homestead', () => {
  const plot={id:110,buildingId:111,roadId:1,frontageA:{x:0,z:0},frontageB:{x:6,z:0},depth:8,side:1,angle:0,backyard:'garden'}
  const profile=residentialPresentationProfile(plot)
  assert.equal(profile.tier,'homestead')
  assert.equal(profile.form,'balanced')
  assert.equal(profile.label,'Homestead compound')
  assert.equal(profile.facadeWindows,2)
  assert.equal(profile.roofFront,'eave')
  assert.equal(profile.frontageStyle,'open')
  assert.equal(profile.rearStructure,'shed')
  assert.equal(profile.courtyard,'none')
})

test('residential presentation makes a wide shallow lot broad-front rather than oversized burgage', () => {
  const plot={id:114,buildingId:115,roadId:1,frontageA:{x:0,z:0},frontageB:{x:9,z:0},depth:6,side:1,angle:0,backyard:'firewood'}
  const profile=residentialPresentationProfile(plot)
  assert.equal(profile.tier,'homestead')
  assert.equal(profile.form,'wide-shallow')
  assert.equal(profile.label,'Broad-front homestead')
  assert.equal(profile.sidePassage,0)
  assert.equal(profile.facadeWindows,3)
  assert.equal(profile.roofFront,'eave')
  assert.equal(profile.frontageStyle,'gate')
  assert.equal(profile.rearStructure,'covered-storage')
  assert.equal(profile.courtyard,'none')
})

test('residential presentation breaks a 10x12 lot into a wide-deep burgage courtyard profile', () => {
  const plot={id:118,buildingId:119,roadId:1,frontageA:{x:0,z:0},frontageB:{x:10,z:0},depth:12,side:1,angle:0,backyard:'garden'}
  const profile=residentialPresentationProfile(plot)
  assert.equal(profile.tier,'burgage')
  assert.equal(profile.form,'wide-deep')
  assert.equal(profile.label,'Burgage courtyard compound')
  assert.notEqual(profile.sidePassage,0)
  assert.ok(profile.houseWidth<5)
  assert.equal(profile.facadeWindows,3)
  assert.equal(profile.roofFront,'eave')
  assert.equal(profile.frontageStyle,'short-fence')
  assert.equal(profile.rearStructure,'lean-to')
  assert.equal(profile.courtyard,'u')
})

test('road endpoints and centerline joins snap exactly and split the host road into a real junction node', () => {
  const roads=[{id:4,width:1.7,points:[{x:-6,z:0},{x:6,z:0}]}]
  assert.deepEqual(snapRoadControlPoint(roads,{x:6.8,z:0.7},{x:2,z:-4},true),{x:6,z:0})
  const center=snapRoadControlPoint(roads,{x:1.1,z:1.1},{x:1,z:-5},true)
  assert.deepEqual(center,{x:1,z:0})
  assert.equal(insertRoadJunctionPoint(roads,center),true)
  assert.deepEqual(roads[0].points,[{x:-6,z:0},{x:1,z:0},{x:6,z:0}])
  assert.equal(insertRoadJunctionPoint(roads,center),false)
})

test('adjacent residential plots snap flush to an existing frontage edge with Grid Snap on', () => {
  const roads=[{id:10,width:1.7,points:[{x:-10,z:0},{x:10,z:0}]}]
  const first=residentialPlotPreview(roads,{x:-5,z:0},{x:-1,z:-7},2.2,true,[])
  assert.ok(first)
  const existing=[{
    id:30,buildingId:31,roadId:first.roadId,
    frontageA:{...first.frontageA},frontageB:{...first.frontageB},
    depth:first.depth,side:first.side,angle:first.angle,backyard:'garden',
  }]
  const second=residentialPlotPreview(roads,{x:-0.35,z:0},{x:4.2,z:-7},2.2,true,existing)
  assert.ok(second)
  assert.equal(second.adjacentSnapped,true)
  assert.deepEqual(second.frontageA,first.frontageB)
  assert.equal(residentialPlotError(second,existing),null)
})

test('road-snapped service buildings sit closer to the street while preserving a valid grid center', () => {
  const roads=[{id:21,width:1.7,points:[{x:-10,z:0},{x:10,z:0}]}]
  const preview=buildingPlacementPreview(roads,{x:2.4,z:-2.2},'blacksmith',true,0)
  assert.equal(preview.snappedToRoad,true)
  assert.equal(Number.isInteger(preview.point.x),true)
  assert.equal(Number.isInteger(preview.point.z),true)
  assert.deepEqual(preview.point,{x:2,z:-3})
  assert.ok(Math.abs(preview.facingAngle)<1e-9)
})

test('Grid Snap rounds road controls independently while Shift angle constrain remains optional', () => {
  const roads=[]
  assert.deepEqual(snapPointToGrid({x:2.49,z:-3.51}),{x:2,z:-4})
  assert.deepEqual(snapRoadControlPoint(roads,{x:5.2,z:2.2},{x:0,z:0},true,false,false),{x:5,z:2})
  assert.deepEqual(snapRoadControlPoint(roads,{x:5.2,z:2.2},{x:0,z:0},true,true,false),{x:5,z:0})
  assert.deepEqual(snapRoadControlPoint(roads,{x:4.2,z:3.7},{x:0,z:0},true,true,false),{x:4,z:4})
  const constrained=snapRoadControlPoint(roads,{x:4.2,z:3.7},{x:0,z:0},false,true,false)
  assert.ok(Math.abs(constrained.x-constrained.z)<1e-9)
  assert.ok(Math.abs(Math.hypot(constrained.x,constrained.z)-Math.hypot(4.2,3.7))<1e-9)
  const free=snapRoadControlPoint(roads,{x:4.2,z:3.7},{x:0,z:0},false,false,false)
  assert.ok(Math.abs(free.x-4.2)<1e-9 && Math.abs(free.z-3.7)<1e-9)
})

test('Road Snap independently controls road endpoint and centerline magnetism', () => {
  const roads=[{id:31,width:1.7,points:[{x:-6,z:0},{x:6,z:0}]}]
  const manual=snapRoadControlPoint(roads,{x:2.4,z:0.5},{x:0,z:-4},false,false,false)
  assert.deepEqual(manual,{x:2.4,z:0.5})
  const center=snapRoadControlPoint(roads,{x:2.4,z:0.5},{x:0,z:-4},false,false,true)
  assert.ok(Math.abs(center.x-2.4)<1e-9 && Math.abs(center.z)<1e-9)
  const endpoint=snapRoadControlPoint(roads,{x:6.8,z:0.4},{x:0,z:-4},true,false,true)
  assert.deepEqual(endpoint,{x:6,z:0})
})

test('Grid Snap rounds residential frontage and depth while keeping the plot on the road edge', () => {
  const roads=[{id:10,width:2,points:[{x:-8,z:0},{x:8,z:0}]}]
  const free=residentialPlotPreview(roads,{x:-2.2,z:0.1},{x:3.35,z:-7.45},2.2,false)
  const snapped=residentialPlotPreview(roads,{x:-2.2,z:0.1},{x:3.35,z:-7.45},2.2,true)
  assert.ok(free && snapped)
  assert.notEqual(free.width,Math.round(free.width))
  assert.equal(snapped.width,6)
  assert.equal(snapped.depth,6)
  assert.ok(Math.abs(snapped.frontageA.z+1.12)<1e-9)
  assert.equal(snapped.housePoint.x,1)
  assert.ok(Number.isInteger(snapped.housePoint.z))
})

test('Road Snap magnetically positions and faces conventional buildings beside a nearby street', () => {
  const roads=[{id:21,width:1.7,points:[{x:-10,z:0},{x:10,z:0}]}]
  const snapped=buildingPlacementPreview(roads,{x:3.2,z:-2.4},'tavern',true,3)
  assert.equal(snapped.snappedToRoad,true)
  assert.equal(snapped.roadId,21)
  assert.deepEqual(snapped.point,{x:3,z:-3})
  assert.ok(Math.abs(snapped.facingAngle)<1e-9)
  assert.equal(snapped.rotation,0)

  const manual=buildingPlacementPreview(roads,{x:3.2,z:-2.4},'tavern',false,3)
  assert.equal(manual.snappedToRoad,false)
  assert.deepEqual(manual.point,{x:3,z:-2})
  assert.equal(manual.rotation,3)
  assert.equal(manual.facingAngle,null)
})

test('Road frontage snaps Campfires and conventional buildings but leaves fortifications manual', () => {
  const roads=[{id:21,width:1.7,points:[{x:-10,z:0},{x:10,z:0}]}]
  const campfire=buildingPlacementPreview(roads,{x:2.3,z:-1.1},'campfire',true,2)
  assert.equal(campfire.snappedToRoad,true)
  assert.equal(campfire.roadId,21)
  assert.equal(buildingRequiresRoadFrontage('campfire'),true)

  for(const type of ['wood-wall','wood-gate']) {
    const preview=buildingPlacementPreview(roads,{x:2.3,z:-1.1},type,true,2)
    assert.equal(preview.snappedToRoad,false)
    assert.deepEqual(preview.point,{x:2,z:-1})
    assert.equal(preview.rotation,2)
    assert.equal(buildingRequiresRoadFrontage(type),false)
  }
  assert.equal(buildingRequiresRoadFrontage('house'),false)
})

test('road-frontage validation rejects off-road conventional buildings and accepts snapped sites', () => {
  const roads=[{id:51,width:1.7,points:[{x:-10,z:0},{x:10,z:0}]}]
  const snapped=buildingPlacementPreview(roads,{x:3.1,z:-2.5},'farmhouse',true,0)
  assert.equal(snapped.snappedToRoad,true)
  assert.equal(buildingRoadPlacementError(roads,snapped.point,'farmhouse'),null)
  assert.match(buildingRoadPlacementError(roads,{x:3,z:-10},'farmhouse'),/road/i)
  assert.match(buildingRoadPlacementError([],{x:3,z:-3},'market'),/Build a road first/i)
  assert.equal(buildingRoadPlacementError([],{x:3,z:-3},'wood-wall'),null)
})

test('curved road sampling preserves endpoints and bends smoothly through control points', () => {
  const controls=[{x:0,z:0},{x:4,z:0},{x:7,z:4}]
  const points=sampleRoadCurve(controls,0.72,0.5)
  assert.deepEqual(points[0],controls[0])
  assert.deepEqual(points.at(-1),controls.at(-1))
  assert.ok(points.length>controls.length)
  assert.ok(points.some(p=>p.x>4 && p.x<7 && p.z>0 && p.z<4))
  assert.ok(roadLength(points)>Math.hypot(7,4))
  assert.equal(roadPlacementError(points),null)
})

test('straight road sampling keeps clicked control points as an aligned polyline', () => {
  const controls=[{x:0,z:0},{x:4,z:0},{x:4,z:5}]
  assert.deepEqual(sampleRoadCurve(controls,0),controls)
})

test('player road strokes normalize deterministically and require meaningful length', () => {
  const points=normalizeRoadPoints([
    {x:0,z:0},{x:0.1,z:0.1},{x:1,z:0.2},{x:2,z:0.5},{x:3,z:1},
  ])
  assert.deepEqual(points[0],{x:0,z:0})
  assert.deepEqual(points.at(-1),{x:3,z:1})
  assert.ok(points.length<5)
  assert.ok(roadLength(points)>3)
  assert.equal(roadPlacementError(points),null)
  assert.match(roadPlacementError([{x:0,z:0},{x:0.5,z:0}]),/2m/)
})

test('residential plot drag snaps frontage to a road and derives road-facing house orientation', () => {
  const roads=[{id:10,width:1.7,points:[{x:-8,z:0},{x:8,z:0}]}]
  const preview=residentialPlotPreview(roads,{x:-2,z:0.4},{x:3,z:-7})
  assert.ok(preview)
  assert.equal(preview.roadId,10)
  assert.ok(Math.abs(preview.width-5)<1e-9)
  assert.ok(Math.abs(preview.depth-6.03)<1e-9)
  assert.equal(preview.side,-1)
  assert.ok(Math.abs(preview.angle)<1e-9)
  assert.equal(preview.houseRotation,0)
  assert.equal(residentialPlotError(preview,[]),null)
  assert.equal(backyardForPlot(13,7),'chickens')
})

test('residential plots reject overlap, buildings and uncleared resources', () => {
  const roads=[{id:10,width:1.7,points:[{x:-8,z:0},{x:8,z:0}]}]
  const preview=residentialPlotPreview(roads,{x:-2,z:0},{x:3,z:-7})
  assert.ok(preview)
  const existing=[{
    id:11,buildingId:12,roadId:10,
    frontageA:{x:-1,z:0},frontageB:{x:4,z:0},depth:7,side:-1,angle:0,backyard:'garden',
  }]
  assert.match(residentialPlotError(preview,existing),/overlap/)
  assert.match(residentialPlotBuildingError(preview,[createBuilding(20,'stockpile',0,-3,true)]),/building/)
  assert.match(residentialPlotResourceError(preview,[{id:30,resource:'wood',remaining:10,x:0,z:-4}]),/Clear resources/)
})

test('player roads and residential plots survive save/load with their modular backyard identity', () => {
  const s=createInitialWorldState()
  const road={id:s.nextId++,width:2.4,points:sampleRoadCurve([{x:4,z:0},{x:7,z:1.2},{x:10,z:0}],0.72,0.5)}
  s.roads.push(road)
  const preview=residentialPlotPreview(s.roads,{x:7,z:1.2},{x:11,z:9})
  assert.ok(preview)
  const house=createBuilding(s.nextId++,'house',preview.housePoint.x,preview.housePoint.z,true,preview.houseRotation)
  s.buildings.push(house); s.topology++
  const plotId=s.nextId++
  s.residentialPlots.push({
    id:plotId,buildingId:house.id,roadId:road.id,
    frontageA:{...preview.frontageA},frontageB:{...preview.frontageB},depth:preview.depth,
    side:preview.side,angle:preview.angle,backyard:backyardForPlot(plotId,preview.depth),
  })
  validateWorld(s)
  house.facingAngle=Math.PI/4
  const loaded=deserializeWorld(serializeWorld(s))
  assert.deepEqual(loaded.roads,s.roads)
  assert.deepEqual(loaded.residentialPlots,s.residentialPlots)
  assert.equal(loaded.buildings.find(b=>b.id===house.id).facingAngle,Math.PI/4)
  validateWorld(loaded)
})

test('cancelling a plotted House blueprint removes the persistent residential plot', () => {
  const s=createInitialWorldState()
  const road={id:s.nextId++,width:1.7,points:[{x:4,z:0},{x:10,z:0}]}
  s.roads.push(road)
  const preview=residentialPlotPreview(s.roads,{x:4,z:0},{x:9,z:7})
  assert.ok(preview)
  const house=createBuilding(s.nextId++,'house',preview.housePoint.x,preview.housePoint.z,false,preview.houseRotation)
  s.buildings.push(house); s.topology++
  const plotId=s.nextId++
  s.residentialPlots.push({
    id:plotId,buildingId:house.id,roadId:road.id,
    frontageA:{...preview.frontageA},frontageB:{...preview.frontageB},depth:preview.depth,
    side:preview.side,angle:preview.angle,backyard:'garden',
  })
  assert.equal(cancelBuilding(s,house.id),null)
  assert.equal(s.residentialPlots.length,0)
  assert.equal(s.buildings.some(b=>b.id===house.id),false)
  validateWorld(s)
})

test('presentation road strip geometry remains deterministic for persisted road segments', () => {
  const link={fromId:1,toId:2,ax:0,az:0,bx:3,bz:4}
  const strip=visualRoadStrip(link)
  assert.equal(strip.x,1.5)
  assert.equal(strip.z,2)
  assert.equal(strip.length,5)
  assert.ok(Math.abs(strip.angle-Math.atan2(3,4))<1e-12)
  assert.deepEqual(link,{fromId:1,toId:2,ax:0,az:0,bx:3,bz:4})
})

test('visual atmosphere is bright by day, cold/dense at night and warmest near twilight', () => {
  const noon=atmosphereForTime(12/24)
  const midnight=atmosphereForTime(0)
  const dusk=atmosphereForTime(19/24)
  assert.ok(noon.daylight>0.9)
  assert.ok(midnight.night>0.9)
  assert.ok(noon.sunIntensity>midnight.sunIntensity)
  assert.ok(midnight.moonIntensity>noon.moonIntensity)
  assert.ok(midnight.moonIntensity>=1.4 && midnight.ambientIntensity>=0.7)
  assert.ok(midnight.fogNear<noon.fogNear && midnight.fogFar<noon.fogFar)
  assert.ok(midnight.fogFar>=118)
  assert.ok(dusk.twilight>0.95)
})

test('construction presentation advances deterministically from foundation to frame to shell', () => {
  assert.equal(constructionVisualStage(0,10,false),'foundation')
  assert.equal(constructionVisualStage(3,10,false),'frame')
  assert.equal(constructionVisualStage(8,10,false),'shell')
  assert.equal(constructionVisualStage(0,10,true),'complete')
})

test('damage presentation maps health bands to readable world states', () => {
  assert.equal(damageVisualStage(100,100,false),'intact')
  assert.equal(damageVisualStage(70,100,false),'worn')
  assert.equal(damageVisualStage(40,100,false),'damaged')
  assert.equal(damageVisualStage(15,100,false),'critical')
  assert.equal(damageVisualStage(0,100,true),'ruin')
})

test('ten settlers gather both resources, carry, deposit, supply three houses and a stockpile', () => {
  const s = createInitialWorldState(); pop10(s)
  const sim = new Simulation(s), initial = { wood: total(s, 'wood'), food: total(s, 'food') }
  for (const [type,x,z] of [['house',-7,0],['house',7,0],['house',7,6],['stockpile',-7,6]]) assert.equal(placeBuilding(s,type,{x,z}), null)
  const stages = new Set()
  for(let i=0;i<6000;i++) {
    sim.step()
    assert.ok(sim.navigation.solved <= PATH_BUDGET)
    for(const job of s.jobs) stages.add(job.kind+':'+job.stage)
    if (i%100===0) {
      validateWorld(s)
      const blocked = blockedCells(s)
      assert.ok(s.settlers.every(a => !blocked.has(cellKey(a))))
    }
  }
  assert.ok(s.buildings.every(b => b.complete))
  assert.equal(s.totals.constructed,4)
  assert.equal(s.totals.delivered.wood,70)
  assert.ok(s.totals.deposited.wood>70 && s.totals.deposited.food>0)
  assert.equal(s.settlers.filter(a=>a.homeId!==null).length,10)
  for (const stage of ['gather:source','gather:work','gather:target','deliver:source','deliver:target','construct:work']) assert.ok(stages.has(stage),stage)
  assert.equal(accountedTotal(s,'wood'),initial.wood); assert.equal(accountedTotal(s,'food'),initial.food)
  assert.equal(sim.navigation.failures,0)
})
test('save/load resumes gathering, loaded cargo, deliveries and construction without loss or duplication', () => {
  for(const stage of ['gather:work','gather:target','deliver:source','deliver:target','construct:work']) {
    const s = createInitialWorldState(); const sim = new Simulation(s)
    if (stage === 'deliver:source') { s.buildings[0].inventory.wood = 20; s.settlers.forEach(a => { a.x = 4; a.z = 5 }) }
    placeBuilding(s,'house',{x:7,z:0})
    let found=false
    for(let i=0;i<4000;i++) {
      sim.step()
      if(s.jobs.some(j=>j.kind+':'+j.stage===stage)) {found=true;break}
    }
    assert.ok(found,stage)
    const saved = serializeWorld(s), loaded = deserializeWorld(saved)
    assert.deepEqual(loaded.jobs,s.jobs); assert.deepEqual(loaded.settlers.map(a=>a.cargo),s.settlers.map(a=>a.cargo))
    const resumed=new Simulation(loaded); advance(resumed,130)
    assert.ok(loaded.buildings.every(b=>b.complete),stage)
    for(const r of ['wood','food']) assert.equal(accountedTotal(loaded,r),accountedTotal(s,r),stage+' '+r)
    assert.equal(resumed.navigation.failures,0)
  }
})
test('queued construction waits for materials and competing sites never double reserve', () => {
  const s=createInitialWorldState(); pop10(s)
  placeBuilding(s,'house',{x:7,z:0}); placeBuilding(s,'house',{x:-7,z:0})
  const sim=new Simulation(s); advance(sim,2)
  assert.ok(s.buildings.filter(b=>!b.complete).every(b=>b.work===0))
  advance(sim,130)
  assert.ok(s.buildings.every(b=>b.complete))
  for(const b of stockpiles(s)) assert.ok(available(s,b,'wood')>=0 && freeStorage(s,b)>=0)
  assert.equal(s.totals.delivered.wood,40)
})
test('full storage pauses gathering and new construction releases capacity', () => {
  const s=createInitialWorldState()
  for(const settler of s.settlers) settler.lastMealDay=s.day
  s.buildings[0].inventory={wood:300,food:100,ale:0,ore:0,tools:0}
  s.targets.wood=350
  const sim=new Simulation(s); advance(sim,2)
  assert.equal(s.jobs.length,0)
  assert.ok(s.settlers.every(a=>a.status.includes('Storage full')))
  placeBuilding(s,'stockpile',{x:7,z:0}); advance(sim,70)
  assert.ok(s.buildings.every(b=>b.complete)); assert.ok(s.totals.deposited.wood>0)
})
test('placement rejects overlap, resource occupation, actors, out of bounds, blocked entrance and route closures', () => {
  const s=createInitialWorldState()
  for(const p of [{x:0,z:0},{x:-19,z:-19},{x:0,z:5},{x:23,z:23},{x:0,z:3}]) assert.ok(placementError(s,'house',p),JSON.stringify(p))
  assert.equal(placeBuilding(s,'house',{x:7,z:0}),null)
  assert.ok(placementError(s,'house',{x:7,z:3}))
  const wall=createInitialWorldState()
  for(const [x,z] of [[7,0],[4,2],[10,2]]) assert.equal(placeBuilding(wall,'house',{x,z}),null)
  assert.match(placementError(wall,'house',{x:7,z:4}), /connected/)
})
test('wall drag snaps to one grid axis and places the whole valid line atomically', () => {
  const s=createInitialWorldState()
  const points=wallLinePoints({x:-8,z:8},{x:-4,z:10})
  assert.deepEqual(points,[
    {x:-8,z:8},{x:-7,z:8},{x:-6,z:8},{x:-5,z:8},{x:-4,z:8},
  ])
  assert.equal(placementBatchError(s,'wood-wall',points,1),null)
  const before=s.buildings.length
  assert.equal(placeBuildingBatch(s,'wood-wall',points,1),null)
  const walls=s.buildings.slice(before)
  assert.equal(walls.length,5)
  assert.ok(walls.every(b=>b.type==='wood-wall' && b.rotation===1 && !b.complete))
  validateWorld(s)
})

test('invalid wall drag rejects the entire line without partial blueprints', () => {
  const s=createInitialWorldState()
  const points=wallLinePoints({x:-3,z:0},{x:3,z:0})
  const before=s.buildings.length
  assert.match(placementBatchError(s,'wood-wall',points,1),/Overlaps/)
  assert.match(placeBuildingBatch(s,'wood-wall',points,1),/Overlaps/)
  assert.equal(s.buildings.length,before)
  validateWorld(s)
})

test('placing a gate on an existing wall converts it and retains the wall timber', () => {
  const s=createInitialWorldState()
  const wall=createBuilding(s.nextId++,'wood-wall',8,8,true)
  s.buildings.push(wall); s.topology++
  const before=s.buildings.length
  assert.equal(placeBuilding(s,'wood-gate',{x:8,z:8},1),null)
  assert.equal(s.buildings.length,before)
  assert.equal(wall.type,'wood-gate')
  assert.equal(wall.complete,false)
  assert.equal(wall.rotation,1)
  assert.equal(wall.delivered.wood,5)
  assert.equal(wall.work,0)
  assert.equal(wall.health,0)
  assert.equal(wall.maxHealth,220)
  validateWorld(s)
})

test('demolition removes an idle completed building and returns half its build materials', () => {
  const s=createInitialWorldState()
  const store=s.buildings[0]
  const house=createBuilding(s.nextId++,'house',8,8,true,2)
  s.buildings.push(house); s.topology++
  const woodBefore=store.inventory.wood
  assert.equal(demolishBuilding(s,house.id),null)
  assert.equal(s.buildings.some(b=>b.id===house.id),false)
  assert.equal(store.inventory.wood,woodBefore+10)
  assert.equal(s.topology,2)
  validateWorld(s)
})

test('building orientation survives save load and unsafe demolition is refused', () => {
  const s=createInitialWorldState()
  const brewery=createBuilding(s.nextId++,'brewery',8,8,true,3)
  brewery.inventory.food=1
  s.buildings.push(brewery); s.topology++
  assert.match(demolishBuilding(s,brewery.id),/Empty this building/)
  const loaded=deserializeWorld(serializeWorld(s))
  const restored=loaded.buildings.find(b=>b.id===brewery.id)
  assert.equal(restored.rotation,3)
  assert.equal(restored.inventory.food,1)
  validateWorld(loaded)
})

test('topology changes invalidate routes and workers finish around new obstacles', () => {
  const s=createInitialWorldState(), sim=new Simulation(s)
  advance(sim,5)
  assert.equal(placeBuilding(s,'house',{x:5,z:6}),null)
  advance(sim,150)
  assert.ok(s.buildings.every(b=>b.complete)); assert.equal(sim.navigation.failures,0)
})
test('exhausted nodes and no storage space do not create invalid work', () => {
  const s=createInitialWorldState(); s.nodes.forEach(n=>n.remaining=0)
  const sim=new Simulation(s); advance(sim,3)
  assert.equal(s.jobs.length,0); assert.ok(s.settlers.every(a=>a.status==='No resources left'))
  validateWorld(s)
})
test('cancelling a blueprint releases reservations and refunds in-flight materials without loss', () => {
  const s=createInitialWorldState()
  s.buildings[0].inventory.wood=30
  const initial=total(s,'wood')
  assert.equal(placeBuilding(s,'house',{x:7,z:0}),null)
  const site=s.buildings.at(-1)
  const sim=new Simulation(s)
  let carrying=false
  for(let i=0;i<800;i++) {
    sim.step()
    if(s.jobs.some(j=>j.kind==='deliver' && j.targetId===site.id && j.stage==='target')) { carrying=true; break }
  }
  assert.ok(carrying)
  assert.equal(cancelBuilding(s,site.id),null)
  assert.ok(!s.buildings.some(b=>b.id===site.id))
  assert.ok(!s.jobs.some(j=>j.targetId===site.id))
  assert.equal(total(s,'wood'),initial)
  validateWorld(s)
})
test('cancelling construction in progress returns delivered materials and clears the builder', () => {
  const s=createInitialWorldState()
  s.buildings[0].inventory.wood=20
  const initial=total(s,'wood')
  assert.equal(placeBuilding(s,'house',{x:7,z:0}),null)
  const site=s.buildings.at(-1)
  const sim=new Simulation(s)
  let building=false
  for(let i=0;i<1400;i++) {
    sim.step()
    if(site.work>0 && !site.complete) { building=true; break }
  }
  assert.ok(building)
  assert.equal(cancelBuilding(s,site.id),null)
  assert.equal(total(s,'wood'),initial)
  assert.ok(!s.jobs.some(j=>j.targetId===site.id))
  validateWorld(s)
})

test('cancellation refuses to destroy resources when storage cannot accept the refund', () => {
  const s=createInitialWorldState()
  s.buildings[0].inventory.wood=20
  assert.equal(placeBuilding(s,'house',{x:7,z:0}),null)
  const site=s.buildings.at(-1)
  const sim=new Simulation(s)
  for(let i=0;i<1400 && site.work===0;i++) sim.step()
  assert.ok(site.delivered.wood>0)
  s.buildings[0].inventory={wood:400,food:0,ale:0,ore:0,tools:0}
  const before=JSON.stringify(s)
  assert.match(cancelBuilding(s,site.id),/free stockpile capacity/)
  assert.equal(JSON.stringify(s),before)
})
test('long-run M1 logistics conserves resources and stays valid', () => {
  const s=createInitialWorldState(); pop10(s)
  const initial={wood:total(s,'wood'),food:total(s,'food')}
  for (const [type,x,z] of [['house',-7,0],['house',7,0],['house',7,6],['stockpile',-7,6]]) assert.equal(placeBuilding(s,type,{x,z}),null)
  const sim=new Simulation(s)
  for(let i=0;i<12000;i++) {
    sim.step()
    if(i%500===0) validateWorld(s)
  }
  validateWorld(s)
  assert.equal(accountedTotal(s,'wood'),initial.wood)
  assert.equal(accountedTotal(s,'food'),initial.food)
  assert.equal(sim.navigation.failures,0)
})


test('stock targets bound routine gathering while construction demand can exceed them', () => {
  const s=createInitialWorldState()
  s.targets={wood:25,food:0,ale:0,ore:0,tools:0}
  const sim=new Simulation(s)
  advance(sim,70)
  const stores=stockpiles(s)
  assert.equal(stores.reduce((n,b)=>n+b.inventory.wood,0),25)
  assert.equal(s.totals.gathered.wood,25)
  assert.equal(s.totals.gathered.food,0)
  assert.ok(s.settlers.every(a=>a.status==='Stock targets met'))

  const build=createInitialWorldState()
  build.targets={wood:0,food:0,ale:0,ore:0,tools:0}
  assert.equal(placeBuilding(build,'house',{x:7,z:0}),null)
  const buildSim=new Simulation(build)
  advance(buildSim,100)
  assert.ok(build.buildings.every(b=>b.complete))
  assert.equal(build.totals.delivered.wood,20)
})

test('legacy M1 saves migrate default stock targets without changing version', () => {
  const s=createInitialWorldState()
  const legacy=JSON.parse(serializeWorld(s))
  delete legacy.targets
  const loaded=deserializeWorld(JSON.stringify(legacy))
  assert.deepEqual(loaded.targets,DEFAULT_TARGETS)
  assert.equal(loaded.version,1)
  validateWorld(loaded)
})

test('blocked routes back off instead of retrying every tick and recover after topology changes', () => {
  const s=createInitialWorldState(), sim=new Simulation(s)
  sim.step()
  const worker=s.settlers.find(a=>a.jobId!==null)
  assert.ok(worker)
  const blocker=createBuilding(s.nextId++,'house',Math.round(worker.x),Math.round(worker.z),true)
  s.buildings.push(blocker); s.topology++
  for(let i=0;i<5;i++) sim.step()
  const firstFailures=sim.navigation.failures
  assert.ok(firstFailures>0)
  for(let i=0;i<20;i++) sim.step()
  assert.equal(sim.navigation.failures,firstFailures)
  s.buildings.splice(s.buildings.findIndex(b=>b.id===blocker.id),1); s.topology++
  for(let i=0;i<80;i++) sim.step()
  assert.equal(sim.navigation.failures,firstFailures)
  assert.notEqual(worker.status,'Route blocked — retrying')
})
