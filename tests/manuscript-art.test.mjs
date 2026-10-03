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

test('canonical manuscript scenes cover every live and planned card, header and title image', () => {
  assert.equal(new Set(manifest.scenes).size, manifest.scenes.length)
  assert.equal(manifest.scenes.length, manifest.sceneGrid[0] * manifest.sceneGrid[1])
  assert.equal(manifest.portraits.length, manifest.portraitGrid[0] * manifest.portraitGrid[1])
  for (const id of [...CURRENT_UI_ASSETS.buildingCards, ...CURRENT_UI_ASSETS.plannedBuildingCards, ...CURRENT_UI_ASSETS.buildingHeaders, ...CURRENT_UI_ASSETS.buildingIcons]) {
    const canonical = manifest.aliases[id] ?? id
    assert.ok(manifest.scenes.includes(canonical), id)
    assert.ok(statSync(new URL(`building/${canonical}.webp`, root)).size > 0)
    for (const rect of Object.values(manifest.cardCrops[canonical])) assert.doesNotThrow(() => cropPresentation(rect, sceneAspect(canonical)))
  }
  for (const id of CURRENT_UI_ASSETS.portraits) assert.ok(statSync(new URL(`portrait/${id}.webp`, root)).size > 0)
})

test('small icon viewports recover the selected source rectangle without stretching', () => {
  for (const id of manifest.scenes) {
    for (const rect of Object.values(manifest.cardCrops[id])) {
      const crop = cropPresentation(rect, sceneAspect(id))
      const [x, y, width, height] = rect
      const [sizeX, sizeY] = crop.size.split(' ').map(parseFloat)
      const [positionX, positionY] = crop.position.split(' ').map(parseFloat)
      assert.ok(Math.abs(positionX * (sizeX / 100 - 1) / sizeX - x) < 0.00001)
      assert.ok(Math.abs(positionY * (sizeY / 100 - 1) / sizeY - y) < 0.00001)
      // These are the live short/normal/wide card drawing areas, above the seal.
      for (const [slotWidth, slotHeight] of [[73, 109], [88, 158], [102, 189]]) {
        const windowHeight = slotHeight * 0.52 - 24
        const drawnWidth = Math.min(slotWidth, windowHeight * crop.ratio)
        const drawnHeight = Math.min(windowHeight, slotWidth / crop.ratio)
        assert.ok(drawnWidth > 0 && drawnWidth <= slotWidth)
        assert.ok(drawnHeight > 0 && drawnHeight <= windowHeight)
        assert.ok(Math.abs(drawnWidth / drawnHeight - sceneAspect(id) * width / height) < 0.00001)
      }
    }
  }
  assert.throws(() => cropPresentation([0.9, 0, 0.2, 1], 2), /Invalid artwork crop/)
  assert.throws(() => cropPresentation([0, 0, 0, 1], 2), /Invalid artwork crop/)
  assert.throws(() => cropPresentation([0, 0, 1, 1], NaN), /Invalid artwork crop/)
})

test('full card crops cover every pixel at short, normal and wide sizes without stretching', () => {
  for (const id of manifest.scenes) {
    const aspect = sceneAspect(id)
    const layers = manifest.singleCardCrops[id] ? [['single', 1]] : [['building', 0.58], ['activity', 0.56]]
    for (const [layer, fraction] of layers) {
      const rect = layer === 'single' ? manifest.singleCardCrops[id] : manifest.cardCrops[id][layer]
      const crop = cropPresentation(rect, aspect)
      for (const [width, height] of [[73, 109], [88, 158], [102, 189]]) {
        const targetHeight = height * fraction
        const imageWidth = Math.max(width / crop.width, targetHeight * aspect / crop.height)
        const imageHeight = imageWidth / aspect
        const left = width / 2 - imageWidth * crop.centerX
        const top = targetHeight / 2 - imageHeight * crop.centerY
        assert.ok(left <= 0.00001 && top <= 0.00001, `${id} ${layer} starts before the frame`)
        assert.ok(left + imageWidth >= width - 0.00001 && top + imageHeight >= targetHeight - 0.00001, `${id} ${layer} fills the frame`)
        assert.ok(Math.abs(imageWidth / imageHeight - aspect) < 0.00001)
      }
    }
  }
})

test('all building sizes bind the exact same canonical image, with no alternate repaint', () => {
  const css = assetCss()
  for (const id of [...manifest.scenes, ...Object.keys(manifest.aliases)]) {
    const canonical = manifest.aliases[id] ?? id
    const rule = css.split('\n').filter((line, index, lines) => line.startsWith(`.medieval-hud [data-ui-asset="building-icon:${id}"]`) && lines[index - 1].includes(`building-header:${id}`) && lines[index - 2].includes(`build-${id}`))
    assert.equal(rule.length, 1, `${id} shares one rule for card, preview, header and icon`)
    assert.ok(rule[0].includes(`/building/${canonical}.webp`))
  }
  assert.equal(readText(new URL('../src/game/ui/ManuscriptAssets.css', import.meta.url)), css)
})

test('canonical scene dimensions match explicit sheet boundaries used by crop geometry', () => {
  assert.equal(manifest.sceneRowBounds.length, manifest.sceneGrid[1])
  const [insetX, insetY] = manifest.sceneSheetInset
  for (let i = 0; i < manifest.scenes.length; i++) {
    const id = manifest.scenes[i]
    const [top, bottom] = manifest.sceneRowBounds[Math.floor(i / manifest.sceneGrid[0])]
    assert.ok(top >= 0 && bottom <= manifest.sceneSheetSize[1] && bottom > top + insetY * 2)
    const data = readFileSync(new URL(`building/${id}.webp`, root))
    // The preparation script emits RGB, lossy VP8 WebP. Check its keyframe
    // dimensions so a recut image cannot silently retain stale CSS geometry.
    assert.equal(data.toString('ascii', 12, 16), 'VP8 ')
    assert.deepEqual([...data.subarray(23, 26)], [0x9d, 0x01, 0x2a])
    const width = data.readUInt16LE(26) & 0x3fff
    const height = data.readUInt16LE(28) & 0x3fff
    assert.equal(width, manifest.sceneSheetSize[0] / manifest.sceneGrid[0] - insetX * 2)
    assert.equal(height, bottom - top - insetY * 2)
    assert.equal(sceneAspect(id), width / height)
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

test('compressed art stays within the documented 1.25 MiB payload budget', () => {
  const files = [...manifest.scenes.map(name => `building/${name}.webp`), ...manifest.portraits.map(name => `portrait/${name}.webp`), ...Object.keys(ICONS).map(name => `icon/${name}.svg`)]
  const total = files.reduce((sum, file) => sum + statSync(new URL(file, root)).size, 0)
  assert.ok(total < 1.25 * 1024 * 1024, `art payload ${total} bytes`)
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
