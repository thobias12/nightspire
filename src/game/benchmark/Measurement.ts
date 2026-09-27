export interface Distribution { samples: number; mean: number; p50: number; p95: number; p99: number; max: number }
export function summarize(samples: number[]): Distribution {
  if (!samples.length) return { samples: 0, mean: 0, p50: 0, p95: 0, p99: 0, max: 0 }
  const sorted = [...samples].sort((a, b) => a - b)
  const percentile = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)]
  return { samples: samples.length, mean: samples.reduce((a, b) => a + b, 0) / samples.length,
    p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99), max: sorted.at(-1)! }
}
export class Measurements {
  private values = new Map<string, number[]>()
  add(name: string, value: number): void {
    if (!Number.isFinite(value) || value < 0) throw new Error('Invalid measurement: ' + name)
    let series = this.values.get(name)
    if (!series) { series = []; this.values.set(name, series) }
    series.push(value)
  }
  report(): Record<string, Distribution> {
    return Object.fromEntries([...this.values].map(([name, values]) => [name, summarize(values)]))
  }
}
