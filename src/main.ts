import './style.css'
import './manuscript-art.css'
import './construction-reference-layout.css'
import './construction-ui-shell.css'
import './manor-reference-ui.css'
import './main-menu.css'
import { BenchmarkApp } from './game/benchmark/BenchmarkApp'
import { Game } from './game/core/Game'
import { SAVE_KEY } from './game/simulation/SaveLoad'

const root = document.querySelector<HTMLDivElement>('#app')

if (!root) {
  throw new Error('Missing #app root')
}

const params = new URLSearchParams(location.search)

if (params.has('benchmark')) {
  new BenchmarkApp(root).start()
} else if (params.has('play')) {
  launchGame(params.has('load'))
} else {
  showMainMenu()
}

function launchGame(loadSaved = false): void {
  root.replaceChildren()
  root.className = ''
  const game = new Game(root)
  if (loadSaved && !game.loadPrimarySave()) {
    game.stop()
    showMainMenu('The local save could not be loaded.')
    return
  }
  game.start()
}

function showMainMenu(message = ''): void {
  const hasSave = localStorage.getItem(SAVE_KEY) !== null
  root.className = 'main-menu-shell'
  root.innerHTML = `
    <main class="main-menu" aria-label="Nightspire main menu">
      <div class="main-menu-brand">
        <span class="main-menu-crest" aria-hidden="true"></span>
        <h1 class="main-menu-title">Nightspire</h1>
        <div class="main-menu-rule" aria-hidden="true"><i></i></div>
      </div>
      <nav class="main-menu-actions">
        <button class="main-menu-action" data-menu-action="new">New Game</button>
        <button class="main-menu-action" data-menu-action="load" ${hasSave ? '' : 'disabled'}>Load Game</button>
        <button class="main-menu-action" data-menu-action="settings">Settings</button>
        <button class="main-menu-action" data-menu-action="credits">Credits</button>
        <button class="main-menu-action" data-menu-action="quit">Quit Game</button>
      </nav>
      <div class="main-menu-rule" aria-hidden="true"><i></i></div>
      <div class="main-menu-note" role="status">${message || (!hasSave ? 'No local save yet.' : '')}</div>
    </main>

    <section class="main-menu-dialog" data-menu-dialog="settings" hidden>
      <h2>Settings</h2>
      <p>Nightspire is currently using the browser display and audio settings. More game-specific options will be added here as the systems mature.</p>
      <div class="dialog-actions"><button data-menu-close>Back</button></div>
    </section>

    <section class="main-menu-dialog" data-menu-dialog="credits" hidden>
      <h2>Credits</h2>
      <p>Nightspire — medieval settlement, economy and nightly-defense prototype.</p>
      <div class="dialog-actions"><button data-menu-close>Back</button></div>
    </section>

    <div class="main-menu-version">Nightspire · Development Build</div>
  `

  root.querySelectorAll<HTMLButtonElement>('[data-menu-action]').forEach(button => {
    button.addEventListener('click', () => {
      const action = button.dataset.menuAction
      if (action === 'new') {
        launchGame(false)
        return
      }
      if (action === 'load') {
        launchGame(true)
        return
      }
      if (action === 'quit') {
        window.close()
        const note = root.querySelector<HTMLElement>('.main-menu-note')
        if (note) note.textContent = 'Close this browser tab to quit Nightspire.'
        return
      }
      if (action === 'settings' || action === 'credits') {
        root.querySelector<HTMLElement>('[data-menu-dialog="' + action + '"]')?.removeAttribute('hidden')
      }
    })
  })

  root.querySelectorAll<HTMLButtonElement>('[data-menu-close]').forEach(button => {
    button.addEventListener('click', () => {
      button.closest<HTMLElement>('.main-menu-dialog')?.setAttribute('hidden', '')
    })
  })
}
