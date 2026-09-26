import { SceneRenderer } from '../render/SceneRenderer'
import { createInitialWorldState, type WorldState } from '../simulation/WorldState'

const SECONDS_PER_GAME_DAY = 180

export class Game {
  private readonly renderer = new SceneRenderer()
  private readonly state: WorldState = createInitialWorldState()
  private readonly resizeObserver: ResizeObserver
  private readonly hud: HTMLDivElement
  private animationFrame = 0
  private lastTime = 0

  constructor(private readonly root: HTMLElement) {
    this.root.className = 'game-shell'
    this.root.append(this.renderer.canvas)

    this.hud = document.createElement('div')
    this.hud.className = 'game-hud'
    this.root.append(this.hud)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(this.root)
    this.resize()
    this.updateHud()
  }

  start(): void {
    this.animationFrame = requestAnimationFrame(this.tick)
  }

  stop(): void {
    cancelAnimationFrame(this.animationFrame)
    this.resizeObserver.disconnect()
    this.renderer.dispose()
  }

  private readonly tick = (timestamp: number): void => {
    const delta = this.lastTime === 0 ? 0 : Math.min((timestamp - this.lastTime) / 1000, 0.1)
    this.lastTime = timestamp

    this.state.elapsedSeconds += delta
    const totalDays = this.state.elapsedSeconds / SECONDS_PER_GAME_DAY
    this.state.day = 1 + Math.floor(totalDays)
    this.state.timeOfDay = (0.32 + totalDays) % 1

    this.renderer.setTimeOfDay(this.state.timeOfDay)
    this.renderer.render()
    this.updateHud()

    this.animationFrame = requestAnimationFrame(this.tick)
  }

  private resize(): void {
    const { clientWidth, clientHeight } = this.root
    this.renderer.resize(clientWidth, clientHeight)
  }

  private updateHud(): void {
    const hour = Math.floor(this.state.timeOfDay * 24)
    const minute = Math.floor((this.state.timeOfDay * 24 - hour) * 60)
    const clock = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`

    this.hud.innerHTML = `
      <h1>Nightspire — foundation</h1>
      <p>Graybox only. Astra should extend the systems, not replace the project with speculative feature stubs.</p>
      <dl>
        <dt>Day</dt><dd>${this.state.day}</dd>
        <dt>Time</dt><dd>${clock}</dd>
        <dt>Settlers</dt><dd>${this.state.settlers}</dd>
        <dt>Enemies</dt><dd>${this.state.enemies}</dd>
      </dl>
    `
  }
}
