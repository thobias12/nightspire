export interface HudEventHandlers {
  action(action: string, value?: string): void
  setOperationDetailsOpen(open: boolean): void
  moveRosterPage(delta: number): void
  toggleBuildMenu(): void
  selectBuildTab(tab: string): void
  selectContextTab(tab: string): void
  showBuildPreview(card: HTMLButtonElement): void
  hideBuildPreview(): void
  syncBuildMenu(): void
  markInspectorPositioned(): void
  placeFloatingPanel(panel: HTMLElement, left: number, top: number): void
  clampFloatingPanels(): void
}

interface DraggedPanel {
  panel: HTMLElement
  pointerId: number
  offsetX: number
  offsetY: number
}

export function bindHudEvents(
  element: HTMLElement,
  signal: AbortSignal,
  handlers: HudEventHandlers,
): void {
  let draggedPanel: DraggedPanel | null = null

  // Tabs, staffing rows and expanded details can grow an already positioned
  // inspector. One HUD observer re-clamps on size changes, without frame polling.
  const inspectorResize = new ResizeObserver(() => handlers.clampFloatingPanels())
  inspectorResize.observe(element.querySelector('.inspector')!)
  signal.addEventListener('abort', () => inspectorResize.disconnect(), { once: true })

  element.addEventListener('toggle', event => {
    const details = event.target as HTMLDetailsElement
    if (details.matches('.operation-details')) handlers.setOperationDetailsOpen(details.open)
  }, { capture: true, signal })

  element.addEventListener('click', event => {
    const target = event.target as HTMLElement
    const minimap = target.closest<HTMLElement>('#minimap-map')
    if (minimap) {
      const rect = minimap.getBoundingClientRect()
      handlers.action(
        'map-focus',
        ((event.clientX - rect.left) / rect.width * 2 - 1) + ',' + ((event.clientY - rect.top) / rect.height * 2 - 1),
      )
      return
    }

    if (target.closest('[data-drag-only]')) {
      event.preventDefault()
      return
    }

    const roster = target.closest<HTMLButtonElement>('button[data-roster]')
    if (roster) {
      handlers.moveRosterPage(Number(roster.dataset.roster))
      return
    }

    const hudToggle = target.closest<HTMLButtonElement>('button[data-hud-toggle]')
    if (hudToggle?.dataset.hudToggle === 'build-menu') {
      handlers.toggleBuildMenu()
      return
    }

    const buildTab = target.closest<HTMLButtonElement>('button[data-build-tab]')
    if (buildTab?.dataset.buildTab) {
      handlers.selectBuildTab(buildTab.dataset.buildTab)
      return
    }

    const contextTab = target.closest<HTMLButtonElement>('button[data-context-tab]')
    if (contextTab?.dataset.contextTab) {
      handlers.selectContextTab(contextTab.dataset.contextTab)
      return
    }

    const plannedCard = target.closest<HTMLButtonElement>('.build-card.is-planned[aria-disabled="true"]')
    if (plannedCard) {
      event.preventDefault()
      handlers.showBuildPreview(plannedCard)
      return
    }

    const button = target.closest<HTMLButtonElement>('button[data-action]')
    if (button) {
      handlers.action(button.dataset.action!, button.dataset.value)
    }
  }, { signal })

  element.addEventListener('pointerover', event => {
    const card = (event.target as HTMLElement).closest<HTMLButtonElement>('.build-card')
    if (card) handlers.showBuildPreview(card)
  }, { signal })

  element.addEventListener('pointerout', event => {
    const card = (event.target as HTMLElement).closest<HTMLButtonElement>('.build-card')
    const next = event.relatedTarget as Node | null
    const preview = element.querySelector('#build-preview')!
    if (preview.contains(event.target as Node)) {
      if (!next || (!preview.contains(next) && !(next instanceof Element && next.closest('.build-card')))) handlers.hideBuildPreview()
      return
    }
    if (!card) return
    if (next && card.contains(next)) return
    if (next && preview.contains(next)) return
    handlers.hideBuildPreview()
  }, { signal })

  element.addEventListener('focusin', event => {
    const card = (event.target as HTMLElement).closest<HTMLButtonElement>('.build-card')
    if (card) handlers.showBuildPreview(card)
  }, { signal })

  element.addEventListener('focusout', event => {
    const card = (event.target as HTMLElement).closest<HTMLButtonElement>('.build-card')
    if (!card) return
    const next = event.relatedTarget as Node | null
    if (next && card.contains(next)) return
    handlers.hideBuildPreview()
  }, { signal })

  element.addEventListener('change', event => {
    const input = event.target as HTMLInputElement
    if (!input.dataset.action) return
    if (input.dataset.action === 'import-save') {
      const file = input.files?.[0]
      if (!file) return
      file.text()
        .then(text => handlers.action('import-save', text))
        .catch(error => handlers.action('import-error', String(error)))
      input.value = ''
      return
    }
    handlers.action(input.dataset.action, input.type === 'checkbox' ? String(input.checked) : input.value)
  }, { signal })

  element.addEventListener('pointerdown', event => {
    if (event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest('button, input, select, textarea, a')) return
    const handle = target.closest<HTMLElement>('[data-drag-handle]')
    const panel = handle?.closest<HTMLElement>('[data-draggable-panel]')
    if (!handle || !panel) return

    const rect = panel.getBoundingClientRect()
    panel.classList.add('is-user-positioned', 'is-dragging')
    panel.style.position = 'fixed'
    panel.style.left = rect.left + 'px'
    panel.style.top = rect.top + 'px'
    panel.style.right = 'auto'
    panel.style.bottom = 'auto'
    panel.style.margin = '0'
    panel.style.transform = 'none'
    if (panel.dataset.panelId === 'inspector') handlers.markInspectorPositioned()
    draggedPanel = {
      panel,
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    }
    event.preventDefault()
  }, { signal })

  window.addEventListener('pointermove', event => {
    const drag = draggedPanel
    if (!drag || drag.pointerId !== event.pointerId) return
    handlers.placeFloatingPanel(drag.panel, event.clientX - drag.offsetX, event.clientY - drag.offsetY)
    event.preventDefault()
  }, { signal })

  const endPanelDrag = (event: PointerEvent) => {
    const drag = draggedPanel
    if (!drag || drag.pointerId !== event.pointerId) return
    drag.panel.classList.remove('is-dragging')
    draggedPanel = null
  }
  window.addEventListener('pointerup', endPanelDrag, { signal })
  window.addEventListener('pointercancel', endPanelDrag, { signal })
  window.addEventListener('resize', () => {
    handlers.syncBuildMenu()
    handlers.clampFloatingPanels()
    handlers.hideBuildPreview()
  }, { signal })
}
