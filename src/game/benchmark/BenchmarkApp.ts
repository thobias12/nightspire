import { FIXED_STEP, DECISION_TICKS, PATH_BUDGET } from '../data/jobs'
import { SceneRenderer } from '../render/SceneRenderer'
import { Simulation } from '../simulation/Simulation'
import { Hud, type Metrics } from '../ui/Hud'
import { Measurements } from './Measurement'
import { createBenchmarkWorld, POPULATIONS, SAMPLE_TICKS, stateDigest, TOTAL_TICKS, WARMUP_TICKS, type Workload } from './Scenarios'
import './benchmark.css'

interface Case { population: number; workload: Workload }
export class BenchmarkApp {
  private renderer: SceneRenderer | null = null
  private sim: Simulation | null = null
  private hud: Hud
  private panel = document.createElement('section')
  private samples = new Measurements()
  private pending: Case[] = []
  private current: Case | null = null
  private reports: Record<string, unknown>[] = []
  private last = 0
  private accumulator = 0
  private hudClock = 0
  private frame = 0
  private solves = 0
  private dropped = 0
  private startupMax = 0
  private queuePeak = 0
  private setupMs = 0
  private beforeDigest = ''
  private startDimensions = ''
  private cancelled = false
  private metrics: Metrics = { frame: 0, simulation: 0, render: 0, calls: 0, triangles: 0, paths: 0, requests: 0, queue: 0, failures: 0, dropped: 0 }
  private resize = new ResizeObserver(() => this.renderer?.resize(this.root.clientWidth, this.root.clientHeight))
  private readonly visibility = () => { if (document.hidden && this.current) this.cancel('Invalidated: tab became hidden. Rerun in foreground.') }

  constructor(private root: HTMLElement) {
    root.className = 'game-shell benchmark-shell'
    this.hud = new Hud(root, () => {})
    this.panel.className = 'benchmark-panel panel'
    this.panel.innerHTML = `
      <h1>M4 · Scale proof</h1><p>Isolated QA worlds · normal cap stays 10 · gameplay saves untouched</p>
      <label>Population <select id="bench-population">${POPULATIONS.map(n => '<option>' + n + '</option>').join('')}</select></label>
      <label>Workload <select id="bench-workload"><option>logistics</option><option>services</option><option>idle</option></select></label>
      <button id="bench-run">Run selected</button><button id="bench-ladder">Run 10–500 ladder</button>
      <button id="bench-cancel">Cancel</button><button id="bench-export">Export reports</button>
      <a href="?">Return to gameplay</a>
      <p id="bench-status" role="status">Ready. 2 simulated seconds warmup + 18 measured per case at 1×. Keep this tab visible.</p>
      <p class="muted">Ladder: logistics + services at 10, 100, 250, 500. Idle and 1000 are optional. Fixed seed; full detail, shadows on, paths off. No GPU timer.</p>
      <pre id="bench-summary"></pre><details><summary>Report JSON</summary><textarea id="benchmark-json" aria-label="Benchmark report JSON" readonly></textarea></details>
    `
    root.append(this.panel)
    this.panel.querySelector('#bench-run')!.addEventListener('click', () => this.run([{
      population: Number((this.panel.querySelector('#bench-population') as HTMLSelectElement).value),
      workload: (this.panel.querySelector('#bench-workload') as HTMLSelectElement).value as Workload,
    }]))
    this.panel.querySelector('#bench-ladder')!.addEventListener('click', () => this.run(
      [10, 100, 250, 500].flatMap(population => (['logistics', 'services'] as Workload[]).map(workload => ({ population, workload }))),
    ))
    this.panel.querySelector('#bench-cancel')!.addEventListener('click', () => this.cancel('Cancelled. Partial runs are not reported as completed.'))
    this.panel.querySelector('#bench-export')!.addEventListener('click', () => {
      const url = URL.createObjectURL(new Blob([this.json()], { type: 'application/json' }))
      const a = document.createElement('a'); a.href = url; a.download = 'nightspire-m4-' + __BUILD_COMMIT__.slice(0, 7) + '.json'; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 0)
    })
    document.addEventListener('visibilitychange', this.visibility)
    this.resize.observe(root)
    this.renderReports()
  }
  private json(): string { return JSON.stringify({ schema: 1, reports: this.reports }, null, 2) }
  private dimensions(): string { return this.root.clientWidth + 'x' + this.root.clientHeight + '@' + Math.min(devicePixelRatio, 2) }
  private status(text: string): void { this.panel.querySelector('#bench-status')!.textContent = text }
  private run(cases: Case[]): void {
    this.cancelled = false; cancelAnimationFrame(this.frame)
    this.pending = [...cases]; this.reports = []; this.renderReports(); this.next()
  }
  private next(): void {
    this.current = this.pending.shift() ?? null
    if (!this.current) { this.status('Complete. Reports include hashes, workload activity and queue latency; FPS alone is not a scale claim.'); return }
    const started = performance.now()
    this.renderer?.dispose(); this.renderer?.canvas.remove()
    this.renderer = new SceneRenderer(this.current.population)
    this.root.prepend(this.renderer.canvas); this.renderer.resize(this.root.clientWidth, this.root.clientHeight)
    this.sim = new Simulation(createBenchmarkWorld(this.current.population, this.current.workload))
    this.sim.profile = true
    this.beforeDigest = stateDigest(this.sim.state); this.startDimensions = this.dimensions()
    this.setupMs = performance.now() - started
    this.last = 0; this.accumulator = 0; this.hudClock = 0; this.solves = 0; this.dropped = 0; this.startupMax = 0; this.queuePeak = 0
    this.samples = new Measurements()
    this.frame = requestAnimationFrame(this.tick)
  }
  private cancel(reason: string): void {
    cancelAnimationFrame(this.frame); this.current = null; this.pending = []; this.cancelled = true
    this.status(reason)
  }
  private tick = (timestamp: number): void => {
    if (!this.current || !this.sim || !this.renderer || this.cancelled) return
    const raw = this.last === 0 ? 0 : (timestamp - this.last) / 1000
    const delta = Math.min(raw, 0.1); this.last = timestamp
    this.dropped += Math.max(0, raw - delta); this.accumulator += delta
    const capture = this.sim.state.tick >= WARMUP_TICKS
    if (capture && raw > 0) this.samples.add('frameMs', raw * 1000)
    const started = performance.now(), requestsBefore = this.sim.navigation.requests
    let steps = 0, paths = 0
    while (this.accumulator >= FIXED_STEP && steps < 8 && this.sim.state.tick < TOTAL_TICKS) {
      const stepStart = performance.now()
      this.sim.step()
      const ms = performance.now() - stepStart
      this.startupMax = Math.max(this.startupMax, ms)
      this.queuePeak = Math.max(this.queuePeak, this.sim.navigation.depth)
      this.solves += this.sim.navigation.solved; paths += this.sim.navigation.solved
      if (this.sim.state.tick > WARMUP_TICKS) {
        this.samples.add('simulationTickMs', ms)
        for (const [stage, time] of Object.entries(this.sim.timings)) {
          if (stage !== 'decisions' || this.sim.state.tick % DECISION_TICKS === 1) this.samples.add(stage + 'Ms', time)
        }
        this.samples.add('queueDepth', this.sim.navigation.depth)
        this.samples.add('activeJobs', this.sim.state.jobs.length)
      }
      for (const wait of this.sim.navigation.waitTicks) this.samples.add('routeWaitSeconds', wait * FIXED_STEP)
      steps++; this.accumulator -= FIXED_STEP
    }
    if (this.accumulator >= FIXED_STEP && this.sim.state.tick < TOTAL_TICKS) { this.dropped += this.accumulator; this.accumulator = 0 }
    const simulationMs = performance.now() - started
    const renderStart = performance.now()
    this.renderer.sync(this.sim.state, null); this.renderer.render()
    const renderMs = performance.now() - renderStart
    const hudStart = performance.now()
    this.hudClock += delta
    if (this.hudClock >= 0.2) {
      this.metrics = { frame: raw * 1000, simulation: simulationMs, render: renderMs, ...this.renderer.stats,
        requests: this.sim.navigation.requests - requestsBefore, paths, queue: this.sim.navigation.depth, failures: this.sim.navigation.failures, dropped: this.dropped }
      this.hud.update(this.sim.state, { paused: false, selectedId: null, buildType: null,
        planningTool: null, buildRotation: 0, dragCount: 0, cinematic: false,
        camera: 'settlement', message: 'BENCHMARK: synthetic workload, saves disabled.', metrics: this.metrics })
      if (capture) this.samples.add('hudUpdateMs', performance.now() - hudStart)
      this.status(this.current.population + ' settlers · ' + this.current.workload + ' · tick ' + this.sim.state.tick + '/' + TOTAL_TICKS + ' · ' + this.pending.length + ' cases remaining')
      this.hudClock = 0
    }
    if (capture) {
      this.samples.add('simulationFrameMs', simulationMs); this.samples.add('renderCpuMs', renderMs)
      this.samples.add('drawCalls', this.renderer.stats.calls); this.samples.add('triangles', this.renderer.stats.triangles)
      this.samples.add('instanceOverflow', this.renderer.overflowInstances)
    }
    if (this.sim.state.tick >= TOTAL_TICKS) { this.finish(); return }
    this.frame = requestAnimationFrame(this.tick)
  }
  private finish(): void {
    const sim = this.sim!, s = sim.state, stats = this.samples.report()
    this.reports.push({
      presetVersion: 2, baselineHead: '4d9097e',
      build: __BUILD_COMMIT__, dirty: __BUILD_DIRTY__, ...this.current,
      valid: this.dimensions() === this.startDimensions && stats.instanceOverflow.max === 0, viewport: this.startDimensions, userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(), fixedStep: FIXED_STEP, pathBudget: PATH_BUDGET,
      warmupTicks: WARMUP_TICKS, sampleTicks: SAMPLE_TICKS, endTick: s.tick, setupMs: this.setupMs,
      startupAndSampleTickMaxMs: this.startupMax, fps: 1000 / stats.frameMs.mean, droppedSeconds: this.dropped,
      navigation: { requests: sim.navigation.requests, solves: this.solves, queuePeak: this.queuePeak, endQueue: sim.navigation.depth, failures: sim.navigation.failures },
      entities: { settlers: s.settlers.length, enemies: s.enemies.length, buildings: s.buildings.length, nodes: s.nodes.length, jobs: s.jobs.length },
      progress: { ...s.totals, serviceVisitors: s.settlers.filter(a => a.status.startsWith('Visiting')).length },
      startDigest: this.beforeDigest, endDigest: stateDigest(s), statistics: stats,
    })
    this.renderReports()
    this.next()
  }
  private renderReports(): void {
    ;(this.panel.querySelector('#benchmark-json') as HTMLTextAreaElement).value = this.json()
    this.panel.querySelector('#bench-summary')!.textContent = this.reports.map(r => {
      const s = r.statistics as ReturnType<Measurements['report']>
      return r.population + ' ' + r.workload + ': tick p95 ' + s.simulationTickMs.p95.toFixed(2) +
        ' ms | frame p95 ' + s.frameMs.p95.toFixed(2) + ' ms | ' + Number(r.fps).toFixed(0) + ' FPS'
    }).join('\n')
  }
  start(): void {}
  stop(): void {
    this.cancel('Stopped.'); this.renderer?.dispose(); this.hud.dispose(); this.resize.disconnect()
    document.removeEventListener('visibilitychange', this.visibility); this.panel.remove()
  }
}
