import './style.css'
import './manuscript-art.css'
import './construction-reference-layout.css'
import './construction-ui-shell.css'
import './manor-reference-ui.css'
import { BenchmarkApp } from './game/benchmark/BenchmarkApp'
import { Game } from './game/core/Game'

const root = document.querySelector<HTMLDivElement>('#app')

if (!root) {
  throw new Error('Missing #app root')
}

if (new URLSearchParams(location.search).has('benchmark')) new BenchmarkApp(root).start()
else new Game(root).start()
