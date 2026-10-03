import './style.css'
import './game/ui/MedievalHud.css'
import './game/ui/ManuscriptHud.css'
import { BenchmarkApp } from './game/benchmark/BenchmarkApp'
import { GameSession } from './game/app/GameSession'

const root = document.querySelector<HTMLDivElement>('#app')

if (!root) {
  throw new Error('Missing #app root')
}

if (new URLSearchParams(location.search).has('benchmark')) new BenchmarkApp(root).start()
else new GameSession(root).start()
