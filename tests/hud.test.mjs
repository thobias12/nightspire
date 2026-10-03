import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { Hud } = require('../.test-build/game/ui/Hud.js')
const { bindHudEvents } = require('../.test-build/game/ui/HudEvents.js')

test('unchanged HUD projection preserves focused controls despite boolean attribute serialization', () => {
  let serialized = ''
  let writes = 0
  let focusedControl = 'worker-button'
  const target = {
    get innerHTML() { return serialized },
    set innerHTML(html) {
      writes++
      focusedControl = null
      // The browser expands boolean attributes when reading innerHTML back.
      serialized = html.replace(' disabled>', ' disabled="">')
    },
  }
  const hud = { renderedHtml: new Map(), element: { querySelector: () => target } }
  const source = '<button disabled>Remove worker</button>'
  Hud.prototype.set.call(hud, 'inspection', source)
  focusedControl = 'worker-button'
  Hud.prototype.set.call(hud, 'inspection', source)
  assert.equal(writes, 1)
  assert.equal(focusedControl, 'worker-button')
  Hud.prototype.set.call(hud, 'inspection', '<button>Remove worker</button>')
  assert.equal(writes, 2)
  assert.equal(serialized, '<button>Remove worker</button>')
})

test('resize clamps world-anchored inspectors as well as manually dragged panels', () => {
  const inspector = { dataset: { panelId: 'inspector' }, style: {}, getBoundingClientRect: () => ({ left: 1200, top: 600, width: 520, height: 300 }) }
  const previousWindow = globalThis.window
  globalThis.window = { innerWidth: 1000, innerHeight: 800 }
  const hud = {
    element: { querySelector: () => null, querySelectorAll: selector => selector.includes('.is-world-anchored') ? [inspector] : [] },
    placeFloatingPanel: Hud.prototype.placeFloatingPanel,
  }
  try {
    Hud.prototype.clampFloatingPanels.call(hud)
    assert.equal(inspector.style.left, '474px')
    assert.equal(inspector.style.top, '426px')
    assert.equal(inspector.style.transform, 'none')
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }
})

test('growing inspector content stays above the dock and its observer disconnects on disposal', () => {
  let height = 360
  let resize
  let observed
  let disconnected = false
  const inspector = { dataset: { panelId: 'inspector' }, style: {}, getBoundingClientRect: () => ({ left: 210, top: 181, width: 520, height: Math.min(height, Number.parseFloat(inspector.style.maxHeight) || Infinity) }) }
  const previousWindow = globalThis.window
  const previousObserver = globalThis.ResizeObserver
  globalThis.window = { innerWidth: 1280, innerHeight: 720, addEventListener() {} }
  globalThis.ResizeObserver = class {
    constructor(callback) { resize = callback }
    observe(element) { observed = element }
    disconnect() { disconnected = true }
  }
  const element = {
    addEventListener() {},
    querySelector: selector => selector === '.inspector' ? inspector : { getBoundingClientRect: () => ({ bottom: 90 }) },
    querySelectorAll: () => [inspector],
  }
  const hud = { element, placeFloatingPanel: Hud.prototype.placeFloatingPanel }
  const abort = new AbortController()
  try {
    bindHudEvents(element, abort.signal, { clampFloatingPanels: () => Hud.prototype.clampFloatingPanels.call(hud) })
    assert.equal(observed, inspector)
    height = 555 // People tab / expanded operations grows after opening.
    resize()
    assert.equal(inspector.style.maxHeight, '548px')
    assert.equal(inspector.style.top, '98px')
    assert.equal(Number.parseFloat(inspector.style.top) + inspector.getBoundingClientRect().height, 646)
    abort.abort()
    assert.equal(disconnected, true)
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
    if (previousObserver === undefined) delete globalThis.ResizeObserver
    else globalThis.ResizeObserver = previousObserver
  }
})
