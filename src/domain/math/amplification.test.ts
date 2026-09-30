import { describe, expect, it } from 'vitest'
import {
  amplificationCurve,
  cumulativeExpected,
  cumulativeWorstCase,
  expectedAmplification,
  expectedAttempts,
  retryRatioPerHop,
  worstCaseAmplification,
} from './amplification'

describe('worstCaseAmplification', () => {
  it('reproduces the Google SRE book worked example of 4^3 = 64', () => {
    expect(worstCaseAmplification([4, 4, 4])).toBe(64)
  })

  it('reproduces the three-hop, three-try case at 27x', () => {
    expect(worstCaseAmplification([3, 3, 3])).toBe(27)
  })

  it('is 1 for a chain where nothing retries', () => {
    expect(worstCaseAmplification([1, 1, 1])).toBe(1)
  })

  it('is 1 for an empty chain', () => {
    expect(worstCaseAmplification([])).toBe(1)
  })

  it('treats a non-retrying hop as a pass-through factor of one', () => {
    // A hop whose retryOn does not cover the selected failure class must not
    // contribute its configured attempts.
    expect(worstCaseAmplification([3, 1, 3])).toBe(9)
  })
})

describe('cumulativeWorstCase', () => {
  it('reports the running product arriving at each hop', () => {
    expect(cumulativeWorstCase([2, 3, 4])).toEqual([2, 6, 24])
  })
})

describe('expectedAttempts', () => {
  it('issues exactly one call when nothing ever fails', () => {
    expect(expectedAttempts(0, 5)).toBe(1)
  })

  it('spends every try when everything always fails', () => {
    expect(expectedAttempts(1, 3)).toBeCloseTo(3, 12)
  })

  it('matches the geometric sum it is a closed form of', () => {
    // 1 + 0.5 + 0.25 = 1.75
    expect(expectedAttempts(0.5, 3)).toBeCloseTo(1.75, 12)
  })

  it('stays accurate as p approaches 1, where the closed form is singular', () => {
    const p = 1 - 1e-12
    // The sum of four terms each within 4e-12 of 1.
    expect(expectedAttempts(p, 4)).toBeCloseTo(4, 8)
  })

  it('is monotonic in p', () => {
    let prev = -Infinity
    for (let i = 0; i <= 100; i++) {
      const v = expectedAttempts(i / 100, 3)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
  })

  it('rejects probabilities outside [0, 1]', () => {
    expect(() => expectedAttempts(-0.1, 3)).toThrow(RangeError)
    expect(() => expectedAttempts(1.1, 3)).toThrow(RangeError)
  })

  it('rejects a non-integer or non-positive try count', () => {
    expect(() => expectedAttempts(0.5, 0)).toThrow(RangeError)
    expect(() => expectedAttempts(0.5, 2.5)).toThrow(RangeError)
  })
})

describe('expectedAmplification', () => {
  it('looks completely healthy at a 1% per-attempt failure rate', () => {
    // This is the entire reason the curve exists: the config that produces a
    // 27x worst case is indistinguishable from a safe one in normal operation.
    const amp = expectedAmplification(0.01, [3, 3, 3])
    expect(amp).toBeGreaterThan(1.02)
    expect(amp).toBeLessThan(1.04)
  })

  it('converges on the worst case as every attempt starts failing', () => {
    expect(expectedAmplification(1, [3, 3, 3])).toBeCloseTo(27, 8)
  })

  it('is 1 when nothing fails, regardless of configured retries', () => {
    expect(expectedAmplification(0, [5, 5, 5])).toBe(1)
  })

  it('never exceeds the worst case', () => {
    const tries = [4, 3, 2]
    const worst = worstCaseAmplification(tries)
    for (let i = 0; i <= 50; i++) {
      expect(expectedAmplification(i / 50, tries)).toBeLessThanOrEqual(
        worst + 1e-9,
      )
    }
  })
})

describe('cumulativeExpected', () => {
  it('agrees with the worst case at p = 1', () => {
    expect(cumulativeExpected(1, [2, 3])).toEqual(
      cumulativeWorstCase([2, 3]).map((v) => expect.closeTo(v, 8)),
    )
  })
})

describe('amplificationCurve', () => {
  it('spans the full probability range', () => {
    const pts = amplificationCurve([3, 3, 3], 40)
    expect(pts).toHaveLength(41)
    expect(pts[0]!.p).toBeCloseTo(0, 12)
    expect(pts.at(-1)!.p).toBeCloseTo(1, 12)
  })

  it('samples densely in the tail where the curve turns up', () => {
    const pts = amplificationCurve([3, 3, 3], 40)
    // With cubic easing toward 1, most samples land above the midpoint.
    const tail = pts.filter((pt) => pt.p > 0.5).length
    expect(tail).toBeGreaterThan(pts.length / 2)
  })

  it('rises monotonically', () => {
    const pts = amplificationCurve([4, 2], 80)
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i]!.amplification).toBeGreaterThanOrEqual(
        pts[i - 1]!.amplification - 1e-12,
      )
    }
  })
})

describe('retryRatioPerHop', () => {
  it('is zero when nothing fails', () => {
    expect(retryRatioPerHop(0, [3, 3])).toEqual([0, 0])
  })

  it('reports retries as a fraction of original calls', () => {
    // At p = 0.1 with 3 tries: 1 + 0.1 + 0.01 = 1.11, so 11% are retries.
    const [first] = retryRatioPerHop(0.1, [3])
    expect(first).toBeCloseTo(0.11, 12)
  })

  it('crosses the 10% per-client ratio the SRE book cites at a ~9% error rate', () => {
    // Establishes that the threshold check in RB005 has a real crossing point.
    const below = retryRatioPerHop(0.08, [3])[0]!
    const above = retryRatioPerHop(0.1, [3])[0]!
    expect(below).toBeLessThan(0.1)
    expect(above).toBeGreaterThan(0.1)
  })
})
