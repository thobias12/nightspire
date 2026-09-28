import './style.css'
import './game/ui/MedievalHud.css'
import { BenchmarkApp } from './game/benchmark/BenchmarkApp'
import { Game } from './game/core/Game'

const root = document.querySelector<HTMLDivElement>('#app')

if (!root) {
  throw new Error('Missing #app root')
}

if (new URLSearchParams(location.search).has('benchmark')) new BenchmarkApp(root).start()
else new Game(root).start()
