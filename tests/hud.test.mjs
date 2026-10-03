import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { Hud } = require('../.test-build/game/ui/Hud.js')

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
  const inspector = { style: {}, getBoundingClientRect: () => ({ left: 1200, top: 600, width: 520, height: 300 }) }
  const previousWindow = globalThis.window
  globalThis.window = { innerWidth: 1000, innerHeight: 800 }
  const hud = {
    element: { querySelectorAll: selector => selector.includes('.is-world-anchored') ? [inspector] : [] },
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
