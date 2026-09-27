import './style.css'

const root = document.querySelector<HTMLDivElement>('#app')

if (!root) {
  throw new Error('Missing #app root')
}

if (new URLSearchParams(location.search).has('benchmark')) {
  import('./game/benchmark/BenchmarkApp').then(({ BenchmarkApp }) => new BenchmarkApp(root).start())
} else {
  import('./game/core/Game').then(({ Game }) => new Game(root).start())
}
