/**
 * Request amplification through a linear call chain.
 *
 * Two numbers matter and they are very different claims:
 *
 *   WORST CASE   — every attempt at every hop fails, so every hop spends all of
 *                  its tries. This is a product, it is an upper bound, and it is
 *                  the operative number during an incident.
 *
 *   EXPECTED(p)  — each attempt fails independently with probability p. This is
 *                  a finite geometric sum. It exists to show why nobody catches
 *                  this in review: at p = 1% a three-hop, three-try chain
 *                  amplifies by about 1.03x and looks completely healthy.
 *
 * The independence assumption behind EXPECTED is false in precisely the
 * situation the tool exists for — a brownout correlates failures across
 * attempts — so real behaviour climbs toward the worst case faster than the
 * curve suggests. The UI prints that next to the chart rather than burying it.
 */

/** Product of effective tries at hops 0..h, for every h. Index h is inclusive. */
export function cumulativeWorstCase(
  effectiveTries: readonly number[],
): number[] {
  const out: number[] = []
  let running = 1
  for (const tries of effectiveTries) {
    running *= tries
    out.push(running)
  }
  return out
}

/** Calls arriving at the innermost hop when every attempt fails. */
export function worstCaseAmplification(
  effectiveTries: readonly number[],
): number {
  let running = 1
  for (const tries of effectiveTries) running *= tries
  return running
}

/**
 * Expected calls one hop issues per call it receives, when it will make up to
 * `tries` attempts and each fails independently with probability `p`.
 *
 *   E(p, t) = 1 + p + p^2 + ... + p^(t-1) = (1 - p^t) / (1 - p)
 *
 * The closed form is singular at p = 1, where the sum is just `t`.
 */
export function expectedAttempts(p: number, tries: number): number {
  if (!Number.isFinite(p) || p < 0 || p > 1) {
    throw new RangeError(`failure probability must be in [0, 1], got ${p}`)
  }
  if (tries < 1 || !Number.isInteger(tries)) {
    throw new RangeError(`tries must be a positive integer, got ${tries}`)
  }
  if (p === 0) return 1
  // Near p = 1 the closed form divides two tiny numbers and loses precision, so
  // fall back to the sum it is a closed form of.
  if (p > 1 - 1e-9) {
    let sum = 0
    for (let i = 0; i < tries; i++) sum += p ** i
    return sum
  }
  return (1 - p ** tries) / (1 - p)
}

/** Expected calls arriving at hops 0..h for one user request, for every h. */
export function cumulativeExpected(
  p: number,
  effectiveTries: readonly number[],
): number[] {
  const out: number[] = []
  let running = 1
  for (const tries of effectiveTries) {
    running *= expectedAttempts(p, tries)
    out.push(running)
  }
  return out
}

/** Expected calls arriving at the innermost hop for one user request. */
export function expectedAmplification(
  p: number,
  effectiveTries: readonly number[],
): number {
  let running = 1
  for (const tries of effectiveTries) running *= expectedAttempts(p, tries)
  return running
}

export interface CurvePoint {
  readonly p: number
  readonly amplification: number
}

/**
 * Samples the amplification curve for plotting.
 *
 * Sampling is denser near p = 1 because that is where the interesting shape is:
 * the curve is almost flat across the whole healthy range and then turns up
 * sharply. Uniform sampling renders the cliff as a single straight segment and
 * hides the entire point of the chart.
 */
export function amplificationCurve(
  effectiveTries: readonly number[],
  samples = 160,
): CurvePoint[] {
  const pts: CurvePoint[] = []
  for (let i = 0; i <= samples; i++) {
    // Cubic easing toward 1 concentrates samples in the tail.
    const t = i / samples
    const p = 1 - (1 - t) ** 3
    pts.push({ p, amplification: expectedAmplification(p, effectiveTries) })
  }
  return pts
}

/**
 * The steady-state ratio of retries to original requests, which is the quantity
 * Google SRE's 10% per-client budget and GEP-3388's 20% budget are expressed
 * against.
 *
 * At the first hop, one user request produces E(p, t) calls, of which
 * E(p, t) - 1 are retries; the ratio is therefore E - 1. Reported per hop,
 * because each layer's budget governs its own retries.
 */
export function retryRatioPerHop(
  p: number,
  effectiveTries: readonly number[],
): number[] {
  return effectiveTries.map((tries) => expectedAttempts(p, tries) - 1)
}
