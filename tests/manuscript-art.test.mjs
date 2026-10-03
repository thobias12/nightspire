import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { manifest, iconBindings, assetCss, cropPresentation, sceneAspect } from '../scripts/prepare-manuscript-ui.mjs'
import { ICONS, iconSvg } from '../scripts/manuscript-icons.mjs'

const require = createRequire(import.meta.url)
const { CURRENT_UI_ASSETS } = require('../.test-build/game/ui/UiAssets.js')
const { createInitialWorldState } = require('../.test-build/game/model/WorldState.js')
const { runQaAction } = require('../.test-build/game/qa/QaActions.js')
const { serializeWorld, deserializeWorld } = require('../.test-build/game/persistence/SaveLoad.js')
const root = new URL('../assets/ui/manuscript/', import.meta.url)
const readText = url => readFileSync(url, 'utf8').replaceAll('\r\n', '\n')

test('dedicated card and wide paintings cover every live and planned UI slot', () => {
  assert.equal(new Set(manifest.scenes).size, manifest.scenes.length)
  assert.equal(manifest.scenes.length, 28)
  assert.equal(manifest.portraits.length, 10)
  const sources = JSON.parse(readText(new URL('art-sources.json', root)))
  const pairs = sources.images.map(image => `${image.id}:${image.variant}`)
  assert.equal(new Set(pairs).size, 56)
  assert.equal(pairs.length, 56)
  assert.equal(new Set(sources.images.map(image => image.source)).size, 56)
  for (const image of sources.images) assert.match(image.source, /^exec-[a-f0-9-]+\.png$/)
  for (const id of [...CURRENT_UI_ASSETS.buildingCards, ...CURRENT_UI_ASSETS.plannedBuildingCards, ...CURRENT_UI_ASSETS.buildingHeaders, ...CURRENT_UI_ASSETS.buildingIcons]) {
    const canonical = manifest.aliases[id] ?? id
    assert.ok(manifest.scenes.includes(canonical), id)
    for (const [variant, folder] of [['card', 'card'], ['wide', 'building']]) {
      assert.ok(pairs.includes(`${canonical}:${variant}`))
      assert.ok(statSync(new URL(`${folder}/${canonical}.webp`, root)).size > 0)
    }
  }
  for (const id of CURRENT_UI_ASSETS.portraits) assert.ok(statSync(new URL(`portrait/${id}.webp`, root)).size > 0)
})

test('title and portrait viewports preserve their selected source rectangle without stretching', () => {
  for (const [rect, aspect] of [[manifest.titleCrop, 192 / 352], [manifest.portraitCrop, 307 / 512]]) {
    const crop = cropPresentation(rect, aspect)
    const [x, y, width, height] = rect
    const [sizeX, sizeY] = crop.size.split(' ').map(parseFloat)
    const [positionX, positionY] = crop.position.split(' ').map(parseFloat)
    assert.ok(Math.abs(positionX * (sizeX / 100 - 1) / sizeX - x) < 0.00001)
    assert.ok(Math.abs(positionY * (sizeY / 100 - 1) / sizeY - y) < 0.00001)
    for (const [slotWidth, slotHeight] of [[24, 24], [40, 40]]) {
      const drawnWidth = Math.min(slotWidth, slotHeight * crop.ratio)
      const drawnHeight = Math.min(slotHeight, slotWidth / crop.ratio)
      assert.ok(drawnWidth > 0 && drawnWidth <= slotWidth)
      assert.ok(drawnHeight > 0 && drawnHeight <= slotHeight)
      assert.ok(Math.abs(drawnWidth / drawnHeight - aspect * width / height) < 0.00001)
    }
  }
  assert.throws(() => cropPresentation([0.9, 0, 0.2, 1], 2), /Invalid artwork crop/)
  assert.throws(() => cropPresentation([0, 0, 0, 1], 2), /Invalid artwork crop/)
  assert.throws(() => cropPresentation([0, 0, 1, 1], NaN), /Invalid artwork crop/)
})

test('portrait paintings fill short, normal and wide cards with bounded cropping', () => {
  const aspect = manifest.imageSizes.card[0] / manifest.imageSizes.card[1]
  for (const [width, height] of [[73, 109], [73, 118], [86, 158], [100, 189]]) {
    const imageWidth = Math.max(width, height * aspect)
    const imageHeight = imageWidth / aspect
    assert.ok(imageWidth >= width && imageHeight >= height)
    assert.ok(1 - width * height / (imageWidth * imageHeight) < 0.25, 'responsive card retains at least 75% of its painting')
    assert.ok(Math.abs(imageWidth / imageHeight - aspect) < 0.00001)
  }
})

test('cards use portrait art while previews and building windows share the wide scene', () => {
  const css = assetCss()
  for (const id of [...manifest.scenes, ...Object.keys(manifest.aliases)]) {
    const canonical = manifest.aliases[id] ?? id
    const rule = css.split('\n').filter((line, index, lines) => line.startsWith(`.medieval-hud [data-ui-asset="building-icon:${id}"]`) && lines[index - 1].includes(`building-header:${id}`) && lines[index - 2].includes(`build-${id}`))
    assert.equal(rule.length, 1, `${id} binds a matched pair`)
    assert.ok(rule[0].includes(`/building/${canonical}.webp`))
    assert.ok(rule[0].includes(`--card-art: url('../../../assets/ui/manuscript/card/${canonical}.webp')`))
  }
  assert.equal(readText(new URL('../src/game/ui/ManuscriptAssets.css', import.meta.url)), css)
  const presentation = readText(new URL('../src/game/ui/ManuscriptHud.css', import.meta.url))
  assert.match(presentation, /background-image: var\(--card-art\); background-size: cover/)
  assert.match(presentation, /background: var\(--card-art\) var\(--building-position\)/)
})

test('every independent painting matches the dimensions used by its UI geometry', () => {
  for (const id of manifest.scenes) for (const [variant, folder] of [['card', 'card'], ['wide', 'building']]) {
    const data = readFileSync(new URL(`${folder}/${id}.webp`, root))
    // The preparation script emits RGB, lossy VP8 WebP. Check its keyframe
    // dimensions so a recut image cannot silently retain stale CSS geometry.
    assert.equal(data.toString('ascii', 12, 16), 'VP8 ')
    assert.deepEqual([...data.subarray(23, 26)], [0x9d, 0x01, 0x2a])
    const width = data.readUInt16LE(26) & 0x3fff
    const height = data.readUInt16LE(28) & 0x3fff
    assert.deepEqual([width, height], manifest.imageSizes[variant])
    if (variant === 'wide') assert.equal(sceneAspect(id), width / height)
  }
})

test('resource, category, command, service and task hooks resolve to deterministic original icons', () => {
  const inventories = [
    ['resources', name => `[data-ui-asset="resource:${name}"]`],
    ['categories', name => `[data-ui-asset="category:${name}"]`],
    ['commands', name => `[data-icon-slot="command-${name}"]`],
    ['services', name => `[data-ui-asset="service:${name}"]`],
    ['notifications', name => `[data-ui-asset="notification:${name}"]`],
    ['utilityIcons', name => `[data-icon-slot="${name}"]`],
  ]
  for (const [inventory, selector] of inventories) {
    for (const name of CURRENT_UI_ASSETS[inventory]) assert.ok(ICONS[iconBindings[selector(name)]], name)
  }
  for (const name of Object.keys(ICONS)) assert.equal(readText(new URL(`icon/${name}.svg`, root)), iconSvg(name))
  assert.throws(() => iconSvg('missing'), /Unknown manuscript icon/)
})

test('two-format compressed art stays within the documented 2 MiB payload budget', () => {
  const files = [...manifest.scenes.flatMap(name => [`building/${name}.webp`, `card/${name}.webp`]), ...manifest.portraits.map(name => `portrait/${name}.webp`), ...Object.keys(ICONS).map(name => `icon/${name}.svg`)]
  const total = files.reduce((sum, file) => sum + statSync(new URL(file, root)).size, 0)
  assert.ok(total < 2 * 1024 * 1024, `art payload ${total} bytes`)
  for (const file of files) assert.ok(statSync(new URL(file, root)).size < 64 * 1024, file)
})

test('visual QA town releases cleared harvest claims, preserves cargo deliveries and remains saveable', () => {
  const state = createInitialWorldState()
  const node = state.nodes.find(node => node.resource === 'wood')
  node.x = -7
  node.z = -3
  const settler = state.settlers[0]
  const job = { id: state.nextId++, kind: 'gather', settlerId: settler.id, sourceId: node.id, targetId: state.buildings[0].id, resource: 'wood', amount: 5, stage: 'source', progress: 0 }
  settler.jobId = job.id
  state.jobs.push(job)
  const carrying = state.settlers[1]
  const carriedNode = state.nodes.filter(node => node.resource === 'wood')[1]
  carriedNode.x = -6
  carriedNode.z = -3
  const delivery = { ...job, id: state.nextId++, settlerId: carrying.id, sourceId: carriedNode.id, stage: 'target' }
  carrying.jobId = delivery.id
  carrying.cargo.wood = delivery.amount
  state.jobs.push(delivery)
  const context = { state, selectedId: null, simulation: { setTimeOfDay() {} }, renderer: { focus: { x: 0, z: 0 } } }
  runQaAction('town-visual', undefined, context)
  assert.equal(node.remaining, 0)
  assert.equal(settler.jobId, null)
  assert.deepEqual(state.jobs, [delivery])
  assert.equal(carrying.jobId, delivery.id)
  assert.equal(carrying.cargo.wood, 5)
  assert.deepEqual(deserializeWorld(serializeWorld(state)), state)
})
