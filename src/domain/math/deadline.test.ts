import { describe, expect, it } from 'vitest'
import type { Backoff } from '../model'
import {
  backoffWaits,
  elapsedAfter,
  meanBackoffWaits,
  resolveDeadlines,
  waterfallBars,
  worstCaseUserLatencyMs,
  type ResolvedHop,
} from './deadline'

const expo = (over: Partial<Backoff> = {}): Backoff => ({
  kind: 'exponential',
  baseMs: 100,
  multiplier: 2,
  capMs: 'none',
  jitter: 'none',
  ...over,
})

const hop = (over: Partial<ResolvedHop> = {}): ResolvedHop => ({
  id: 'h',
  totalTries: 3,
  effectiveTries: 3,
  timeoutMs: Infinity,
  timeoutScope: 'includes-retries',
  perTryTimeoutMs: Infinity,
  backoff: expo(),
  ...over,
})

describe('backoffWaits', () => {
  it('returns one fewer wait than there are attempts', () => {
    expect(backoffWaits(expo(), 3)).toHaveLength(2)
    expect(backoffWaits(expo(), 1)).toHaveLength(0)
  })

  it('doubles a standard exponential schedule', () => {
    expect(backoffWaits(expo(), 5)).toEqual([100, 200, 400, 800])
  })

  it('clamps at the cap', () => {
    expect(backoffWaits(expo({ capMs: 300 }), 5)).toEqual([100, 200, 300, 300])
  })

  it('repeats a fixed delay', () => {
    expect(backoffWaits({ ...expo(), kind: 'fixed' }, 4)).toEqual([100, 100, 100])
  })

  it('is all zeroes when there is no backoff at all', () => {
    expect(backoffWaits({ ...expo(), kind: 'none' }, 4)).toEqual([0, 0, 0])
  })

  it('bounds decorrelated jitter at base x 3^(n), per the AWS simulator', () => {
    // sleep starts at base and each draw is uniform(base, sleep * 3), so the
    // first retry can already wait three times the base.
    expect(backoffWaits(expo({ jitter: 'decorrelated' }), 4)).toEqual([
      300, 900, 2700,
    ])
  })

  it('follows the Envoy series (2^N - 1) x base, capped at 250ms by default', () => {
    // Envoy's defaults: 25ms base, cap of ten times the base.
    const envoy: Backoff = {
      kind: 'envoy-exponential',
      baseMs: 25,
      multiplier: 2,
      capMs: 250,
      jitter: 'full',
    }
    expect(backoffWaits(envoy, 5)).toEqual([25, 75, 175, 250])
  })

  it('leaves the worst case unchanged for full and equal jitter', () => {
    // Both sample within [0, w], so the upper bound is still w.
    expect(backoffWaits(expo({ jitter: 'full' }), 4)).toEqual([100, 200, 400])
    expect(backoffWaits(expo({ jitter: 'equal' }), 4)).toEqual([100, 200, 400])
  })
})

describe('meanBackoffWaits', () => {
  it('halves the wait under full jitter', () => {
    expect(meanBackoffWaits(expo({ jitter: 'full' }), 4)).toEqual([50, 100, 200])
  })

  it('takes three quarters under equal jitter', () => {
    expect(meanBackoffWaits(expo({ jitter: 'equal' }), 3)).toEqual([75, 150])
  })

  it('leaves an unjittered schedule alone', () => {
    expect(meanBackoffWaits(expo(), 3)).toEqual([100, 200])
  })
})

describe('elapsedAfter', () => {
  it('counts attempts plus the gaps between them', () => {
    // 3 attempts of 1000ms with waits of 100 and 200 between them.
    expect(elapsedAfter(3, 1000, [100, 200])).toBe(3300)
  })

  it('charges no wait for a single attempt', () => {
    expect(elapsedAfter(1, 1000, [100, 200])).toBe(1000)
  })

  it('is zero for no attempts', () => {
    expect(elapsedAfter(0, 1000, [100])).toBe(0)
  })
})

describe('resolveDeadlines', () => {
  it('finds every attempt reachable when the deadline is generous', () => {
    const [d] = resolveDeadlines([
      hop({ timeoutMs: 5000, perTryTimeoutMs: 1000 }),
    ])
    // 3 x 1000 + (100 + 200) = 3300, inside 5000.
    expect(d!.reachableTries).toBe(3)
    expect(d!.worstCaseMs).toBe(3300)
  })

  it('drops the attempts that cannot fit inside the deadline', () => {
    const [d] = resolveDeadlines([
      hop({ timeoutMs: 2500, perTryTimeoutMs: 1000 }),
    ])
    // elapsed(3) = 3300 > 2500, elapsed(2) = 2100 <= 2500.
    expect(d!.configuredTries).toBe(3)
    expect(d!.reachableTries).toBe(2)
  })

  it('collapses to a single attempt when the per-try timeout exceeds the deadline', () => {
    // The headline counterintuitive result: an inverted per-try timeout costs
    // you attempts, it does not buy you longer ones.
    const [d] = resolveDeadlines([
      hop({ timeoutMs: 5000, perTryTimeoutMs: 10_000 }),
    ])
    expect(d!.attemptBoundMs).toBe(5000)
    expect(d!.reachableTries).toBe(1)
  })

  it('treats a missing per-attempt timeout as one attempt consuming the window', () => {
    const [d] = resolveDeadlines([
      hop({ timeoutMs: 5000, perTryTimeoutMs: Infinity }),
    ])
    expect(d!.noPerAttemptTimeout).toBe(true)
    // The attempt is still bounded by the deadline that kills it...
    expect(d!.attemptBoundMs).toBe(5000)
    // ...which leaves no room for the other two.
    expect(d!.reachableTries).toBe(1)
  })

  it('reports a configured per-attempt timeout as bounded', () => {
    const [d] = resolveDeadlines([
      hop({ timeoutMs: 5000, perTryTimeoutMs: 1000 }),
    ])
    expect(d!.noPerAttemptTimeout).toBe(false)
  })

  it('counts a per-attempt-scoped timeout as a real per-attempt bound', () => {
    const [d] = resolveDeadlines([
      hop({ timeoutMs: 1000, timeoutScope: 'per-attempt' }),
    ])
    expect(d!.noPerAttemptTimeout).toBe(false)
  })

  it('allows every attempt when nothing is bounded anywhere', () => {
    const [d] = resolveDeadlines([hop()])
    expect(d!.reachableTries).toBe(3)
    expect(d!.worstCaseMs).toBe(Infinity)
  })

  it('does not let a per-attempt-scoped timeout bound the retry sequence', () => {
    // A hop whose "timeout" applies per attempt can run far longer than it.
    const [d] = resolveDeadlines([
      hop({ timeoutMs: 1000, timeoutScope: 'per-attempt' }),
    ])
    expect(d!.attemptBoundMs).toBe(1000)
    expect(d!.availableMs).toBe(Infinity)
    expect(d!.reachableTries).toBe(3)
    // 3 x 1000 + 300 of backoff, despite a "1s timeout".
    expect(d!.worstCaseMs).toBe(3300)
  })

  it('narrows a child deadline to what the parent actually allows', () => {
    const ds = resolveDeadlines([
      hop({ id: 'gw', timeoutMs: 10_000, perTryTimeoutMs: 3000 }),
      hop({ id: 'svc', timeoutMs: 5000, perTryTimeoutMs: 1000 }),
    ])
    // The inner hop's own 5s timeout is irrelevant: its parent gives it 3s.
    expect(ds[1]!.availableMs).toBe(3000)
    // 2 x 1000 + 100 = 2100 fits; 3 x 1000 + 300 = 3300 does not.
    expect(ds[1]!.reachableTries).toBe(2)
  })

  it('bounds a parent attempt by its child worst case when that is smaller', () => {
    const ds = resolveDeadlines([
      hop({ id: 'gw', timeoutMs: 60_000, perTryTimeoutMs: 30_000 }),
      hop({
        id: 'svc',
        totalTries: 1,
        effectiveTries: 1,
        timeoutMs: 800,
        perTryTimeoutMs: 800,
      }),
    ])
    // The child returns in at most 800ms, so a parent attempt cannot take 30s.
    expect(ds[1]!.worstCaseMs).toBe(800)
    expect(ds[0]!.attemptBoundMs).toBe(800)
    // 3 x 800 + 300 of backoff.
    expect(ds[0]!.worstCaseMs).toBe(2700)
  })

  it('always grants at least one attempt, even with no budget left', () => {
    const ds = resolveDeadlines([
      hop({ id: 'gw', timeoutMs: 100, perTryTimeoutMs: 50 }),
      hop({ id: 'svc', timeoutMs: 5000, perTryTimeoutMs: 1000 }),
    ])
    expect(ds[1]!.reachableTries).toBe(1)
  })

  it('returns nothing for an empty chain', () => {
    expect(resolveDeadlines([])).toEqual([])
  })
})

describe('worstCaseUserLatencyMs', () => {
  it('is the outermost hop worst case', () => {
    const ds = resolveDeadlines([
      hop({ id: 'gw', timeoutMs: 20_000, perTryTimeoutMs: 2000 }),
      hop({ id: 'svc', totalTries: 1, effectiveTries: 1, perTryTimeoutMs: 500 }),
    ])
    expect(worstCaseUserLatencyMs(ds)).toBe(ds[0]!.worstCaseMs)
  })

  it('is zero for an empty chain', () => {
    expect(worstCaseUserLatencyMs([])).toBe(0)
  })
})

describe('waterfallBars', () => {
  it('lays out every configured attempt, including the unreachable ones', () => {
    const [d] = resolveDeadlines([
      hop({ timeoutMs: 2500, perTryTimeoutMs: 1000 }),
    ])
    const bars = waterfallBars(d!)
    const attempts = bars.filter((b) => b.kind === 'attempt')
    expect(attempts).toHaveLength(3)
    expect(attempts.filter((b) => b.reachable)).toHaveLength(2)
    expect(attempts.at(-1)!.reachable).toBe(false)
  })

  it('places waits between attempts and never before the first', () => {
    const [d] = resolveDeadlines([
      hop({ timeoutMs: 9000, perTryTimeoutMs: 1000 }),
    ])
    const bars = waterfallBars(d!)
    expect(bars[0]!.kind).toBe('attempt')
    expect(bars[0]!.startMs).toBe(0)
    const waits = bars.filter((b) => b.kind === 'wait')
    expect(waits.map((w) => w.endMs - w.startMs)).toEqual([100, 200])
  })

  it('produces a contiguous timeline with no gaps or overlaps', () => {
    const [d] = resolveDeadlines([
      hop({ totalTries: 5, timeoutMs: 20_000, perTryTimeoutMs: 700 }),
    ])
    const bars = waterfallBars(d!)
    for (let i = 1; i < bars.length; i++) {
      expect(bars[i]!.startMs).toBe(bars[i - 1]!.endMs)
    }
  })
})
