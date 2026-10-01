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
