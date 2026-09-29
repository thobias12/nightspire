import type { BuildingId } from '../data/buildings'
import type { PlanningState } from './PlanningState'

export interface GameHotkeyHandlers {
  action(action: string, value?: string): void
  refreshRoadDraft(): void
  updateGhost(): void
  updateHud(): void
  undoRoadControlPoint(): void
  undoFieldControlPoint(): void
  finalizeRoadDraft(): void
  finalizeFieldDraft(): void
  adjustRoadWidth(direction: -1 | 1): void
}

const BUILD_HOTKEYS: Record<string, BuildingId> = {
  '2': 'stockpile',
  '3': 'campfire',
  '4': 'brewery',
  '5': 'tavern',
  '6': 'guard-post',
  '7': 'wood-wall',
  '8': 'wood-gate',
  '9': 'blacksmith',
}

export function bindGameHotkeys(
  planning: PlanningState,
  signal: AbortSignal,
  handlers: GameHotkeyHandlers,
): void {
  window.addEventListener('keydown', event => {
    if ((event.target as HTMLElement).matches('input, select, textarea, button')) return
    if (event.key === '0') {
      event.preventDefault()
      handlers.action('road')
      return
    }
    if (event.key === '1') {
      event.preventDefault()
      handlers.action('residential-plot')
      return
    }

    const hotkey = BUILD_HOTKEYS[event.key]
    if (hotkey) {
      event.preventDefault()
      handlers.action(hotkey)
      return
    }

    const key = event.key.toLowerCase()
    if (key === 'm') {
      event.preventDefault()
      handlers.action('market')
      return
    }
    if (key === 't') {
      event.preventDefault()
      handlers.action('trading-post')
      return
    }
    if (key === 'a') {
      event.preventDefault()
      handlers.action('farmhouse')
      return
    }
    if (key === 'p') {
      event.preventDefault()
      handlers.action('field')
      return
    }

    if (planning.tool === 'road' && event.key === 'Shift') {
      if (!planning.roadAngleSnap) {
        planning.roadAngleSnap = true
        handlers.refreshRoadDraft()
        handlers.updateGhost()
        handlers.updateHud()
      }
      return
    }
    if (planning.tool === 'road' && event.key === 'Backspace') {
      event.preventDefault()
      handlers.undoRoadControlPoint()
      return
    }
    if (planning.tool === 'field' && event.key === 'Backspace') {
      event.preventDefault()
      handlers.undoFieldControlPoint()
      return
    }
    if (planning.tool === 'road' && event.key === 'Enter') {
      event.preventDefault()
      handlers.finalizeRoadDraft()
      return
    }
    if (planning.tool === 'field' && event.key === 'Enter') {
      event.preventDefault()
      handlers.finalizeFieldDraft()
      return
    }
    if (planning.tool === 'road' && event.key === '[') {
      event.preventDefault()
      handlers.adjustRoadWidth(-1)
      return
    }
    if (planning.tool === 'road' && event.key === ']') {
      event.preventDefault()
      handlers.adjustRoadWidth(1)
      return
    }
    if (planning.tool === 'road' && key === 'c') {
      event.preventDefault()
      handlers.action('road-curve')
      return
    }
    if (key === 'g') {
      event.preventDefault()
      handlers.action('grid-snap')
      return
    }
    if (key === 'f') {
      event.preventDefault()
      handlers.action('road-snap')
      return
    }
    if (key === 'r' && planning.buildType) {
      event.preventDefault()
      handlers.action('rotate-build')
    }
    if (key === 'v' && !planning.buildType && !planning.tool) {
      event.preventDefault()
      handlers.action('cinematic')
    }
  }, { signal })

  window.addEventListener('keyup', event => {
    if (event.key !== 'Shift' || !planning.roadAngleSnap) return
    planning.roadAngleSnap = false
    if (planning.tool === 'road') {
      handlers.refreshRoadDraft()
      handlers.updateGhost()
      handlers.updateHud()
    }
  }, { signal })
}
