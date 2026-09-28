import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { clearPlanningDrafts, createPlanningState, resetPlanningForImport } = require('../.test-build/game/app/PlanningState.js')
const { roadCurveLabel } = require('../.test-build/game/app/PlanningOperations.js')

test('planning reset clears every transient draft while preserving user placement preferences', () => {
  const state = createPlanningState()
  state.buildType = 'house'
  state.buildRotation = 3
  state.tool = 'field'
  state.start = { x: 1, z: 2 }
  state.roadControlPoints = [{ x: 1, z: 1 }]
  state.roadDraft = [{ x: 2, z: 2 }]
  state.roadAngleSnap = true
  state.fieldControlPoints = [{ x: 3, z: 3 }]
  state.fieldDraft = [{ x: 4, z: 4 }]
  state.fieldCloseReady = true
  state.pointer = { x: 5, z: 5 }
  state.rawPointer = { x: 5.2, z: 5.4 }
  state.dragStart = { x: 6, z: 6 }
  state.dragPoints = [{ x: 6, z: 6 }, { x: 7, z: 6 }]
  state.suppressClick = true
  state.gridSnap = false
  state.roadSnap = false
  state.roadWidth = 2.4
  state.roadCurve = 0

  clearPlanningDrafts(state)

  assert.equal(state.buildType, null)
  assert.equal(state.tool, null)
  assert.equal(state.start, null)
  assert.deepEqual(state.roadControlPoints, [])
  assert.deepEqual(state.roadDraft, [])
  assert.equal(state.roadAngleSnap, false)
  assert.deepEqual(state.fieldControlPoints, [])
  assert.deepEqual(state.fieldDraft, [])
  assert.equal(state.fieldCloseReady, false)
  assert.equal(state.pointer, null)
  assert.equal(state.rawPointer, null)
  assert.equal(state.dragStart, null)
  assert.deepEqual(state.dragPoints, [])
  assert.equal(state.suppressClick, false)

  assert.equal(state.buildRotation, 3)
  assert.equal(state.gridSnap, false)
  assert.equal(state.roadSnap, false)
  assert.equal(state.roadWidth, 2.4)
  assert.equal(state.roadCurve, 0)
})

test('import reset also returns building rotation to its canonical orientation', () => {
  const state = createPlanningState()
  state.buildType = 'mine'
  state.buildRotation = 2
  state.fieldControlPoints = [{ x: 1, z: 1 }, { x: 2, z: 1 }, { x: 2, z: 2 }]
  resetPlanningForImport(state)
  assert.equal(state.buildType, null)
  assert.equal(state.buildRotation, 0)
  assert.deepEqual(state.fieldControlPoints, [])
})

test('road curve labels stay stable outside Game coordinator', () => {
  assert.equal(roadCurveLabel(0), 'Straight')
  assert.equal(roadCurveLabel(0.58), 'Smooth')
  assert.equal(roadCurveLabel(0.92), 'Curved')
})
