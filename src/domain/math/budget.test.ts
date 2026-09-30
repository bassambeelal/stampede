import { describe, expect, it } from 'vitest'
import { concurrencyFromLoad, translateBudget, unitsAgree } from './budget'

const load = { rps: 100, meanLatencyMs: 200 }

describe('concurrencyFromLoad', () => {
  it('applies Little’s law: 100 req/s at 200ms is 20 in flight', () => {
    expect(concurrencyFromLoad(100, 200)).toBeCloseTo(20, 12)
  })
})

describe('translateBudget', () => {
  it('resolves Envoy’s default 20% / floor 3 as a concurrency cap', () => {
    const a = translateBudget(
      { kind: 'envoy-concurrency-pct', value: 20, floor: 3 },
      load,
    )
    expect(a.nativeUnit).toBe('concurrent-retries')
    // max(3, 0.2 x 20) = 4
    expect(a.native).toBeCloseTo(4, 12)
    // 4 concurrent retries lasting 200ms each is 20 retries/s.
    expect(a.asRetriesPerSecond).toBeCloseTo(20, 12)
    expect(a.usedLatencyAssumption).toBe(true)
  })

  it('lets Envoy’s floor dominate on a quiet service', () => {
    const a = translateBudget(
      { kind: 'envoy-concurrency-pct', value: 20, floor: 3 },
      { rps: 5, meanLatencyMs: 100 },
    )
    // 0.5 in flight; 20% of that is 0.1, so the floor of 3 governs.
    expect(a.native).toBe(3)
  })

  it('falls back to the floor alone when no load is given', () => {
    const a = translateBudget(
      { kind: 'envoy-concurrency-pct', value: 20, floor: 3 },
      null,
    )
    expect(a.native).toBe(3)
    expect(a.asRetriesPerSecond).toBeNull()
  })

  it('resolves Linkerd’s 20% ratio with its 10 retries/s floor', () => {
    const a = translateBudget({ kind: 'rate-ratio', value: 0.2, floor: 10 }, load)
    expect(a.nativeUnit).toBe('retries-per-second')
    // max(10, 0.2 x 100) = 20
    expect(a.native).toBeCloseTo(20, 12)
    expect(a.asConcurrentRetries).toBeCloseTo(4, 12)
  })

  it('shows the Linkerd floor turning a quiet service into a 3x ceiling', () => {
    // 10 free retries/s against 5 req/s of real traffic.
    const a = translateBudget(
      { kind: 'rate-ratio', value: 0.2, floor: 10 },
      { rps: 5, meanLatencyMs: 50 },
    )
    expect(a.native).toBe(10)
    expect(a.native / 5).toBe(2)
  })

  it('resolves Google SRE’s 10% per-client ratio, which has no floor', () => {
    const a = translateBudget({ kind: 'rate-ratio', value: 0.1 }, load)
    expect(a.native).toBeCloseTo(10, 12)
  })

  it('reads Gateway API’s percent over a window as a rate', () => {
    const a = translateBudget(
      { kind: 'gateway-windowed-pct', value: 20, floor: 10, windowSec: 10 },
      { rps: 200, meanLatencyMs: 100 },
    )
    // max(10, 20% of 200) = 40 retries/s
    expect(a.native).toBeCloseTo(40, 12)
    expect(a.usedLatencyAssumption).toBe(false)
  })

  it('refuses to invent a rate when throughput is unknown and there is no floor', () => {
    const a = translateBudget({ kind: 'rate-ratio', value: 0.1 }, null)
    expect(a.asRetriesPerSecond).toBeNull()
    expect(a.workings).toMatch(/needs throughput/)
  })
})

describe('unitsAgree', () => {
  it('distinguishes a concurrency cap from a rate cap', () => {
    expect(
      unitsAgree(
        { kind: 'envoy-concurrency-pct', value: 20 },
        { kind: 'rate-ratio', value: 0.2 },
      ),
    ).toBe(false)
  })

  it('treats Linkerd and Gateway API as the same family of unit', () => {
    expect(
      unitsAgree(
        { kind: 'rate-ratio', value: 0.2 },
        { kind: 'gateway-windowed-pct', value: 20 },
      ),
    ).toBe(true)
  })
})
