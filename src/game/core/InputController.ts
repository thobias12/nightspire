import type { SceneRenderer } from '../render/SceneRenderer'
import type { Simulation } from '../simulation/Simulation'

export class InputController {
  private readonly keys = new Set<string>()
  private readonly released = new Set<string>()
  private readonly abort = new AbortController()
  constructor(private renderer: SceneRenderer, private simulation: Simulation, cancel: () => void) {
    const signal = this.abort.signal
    window.addEventListener('keydown', e => {
      if ((e.target as HTMLElement).matches('input, select, textarea, button')) return
      const key = e.key.toLowerCase()
      if (key === 'escape') { cancel(); return }
      if (['w','a','s','d','q','e','arrowup','arrowdown','arrowleft','arrowright'].includes(key)) {
        e.preventDefault(); this.keys.add(key); this.released.delete(key)
      }
    }, { signal })
    // Preserve very short taps until the next frame has consumed them.
    window.addEventListener('keyup', e => this.released.add(e.key.toLowerCase()), { signal })
    window.addEventListener('blur', () => { this.keys.clear(); this.released.clear() }, { signal })
    document.addEventListener('visibilitychange', () => { this.keys.clear(); this.released.clear() }, { signal })
    renderer.canvas.addEventListener('wheel', e => {
      e.preventDefault()
      renderer.zoom = Math.max(15, Math.min(58, renderer.zoom + e.deltaY * 0.03))
    }, { signal, passive: false })
  }
  update(delta: number, paused: boolean): void {
    const r = this.renderer, down = (k: string) => Number(this.keys.has(k))
    r.angle += (down('q') - down('e')) * delta
    const x = down('d') - down('a') + down('arrowright') - down('arrowleft')
    const z = down('s') - down('w') + down('arrowdown') - down('arrowup')
    for (const key of this.released) this.keys.delete(key)
    this.released.clear()
    const length = Math.hypot(x, z)
    if (!length) return
    const dx = (x * Math.cos(r.angle) + z * Math.sin(r.angle)) / length * delta
    const dz = (-x * Math.sin(r.angle) + z * Math.cos(r.angle)) / length * delta
    if (r.mode === 'settlement') {
      r.focus.x = Math.max(-23, Math.min(23, r.focus.x + dx * 16))
      r.focus.z = Math.max(-23, Math.min(23, r.focus.z + dz * 16))
    } else if (!paused) {
      const p = this.simulation.state.player, nav = this.simulation.navigation
      nav.sync(this.simulation.state)
      const nextX = { x: p.x + dx * 5, z: p.z }
      if (nav.walkable(nextX)) p.x = nextX.x
      const nextZ = { x: p.x, z: p.z + dz * 5 }
      if (nav.walkable(nextZ)) p.z = nextZ.z
    }
  }
  dispose(): void { this.abort.abort(); this.keys.clear(); this.released.clear() }
}
