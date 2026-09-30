import type { Backoff, TimeoutScope } from '../model'

/**
 * Deadline composition, and the attempts your deadlines make impossible.
 *
 * The result this module exists to produce: a hop configured for five attempts
 * frequently only has room for two. Backoff waits and per-attempt timeouts have
 * to fit inside the enclosing deadline, and when they do not, the remaining
 * attempts are not shortened — they simply never happen. Tightening an outer
 * timeout therefore *removes* attempts, which is the opposite of what most
 * people expect it to do.
 *
 * Everything here is a worst-case bound derived from configured timeouts. None
 * of it is a measurement, and none of it is a percentile.
 *
 * `Infinity` is used internally for "not bounded", which covers both an
 * explicit `'none'` and an UNKNOWN field. Callers track which of the two it was
 * so the UI can say "unbounded" rather than "unknown" where that is the truth.
 */

/** A hop with every field already resolved to a plain number. */
export interface ResolvedHop {
  readonly id: string
  /** Attempts the config asks for, including the first. */
  readonly totalTries: number
  /** Attempts that actually apply to the failure class under consideration. */
  readonly effectiveTries: number
  /** This hop's own deadline, `Infinity` when unbounded or unknown. */
  readonly timeoutMs: number
  /** Whether `timeoutMs` covers the retry sequence or just one attempt. */
  readonly timeoutScope: TimeoutScope
  /** Per-attempt deadline, `Infinity` when unbounded or unknown. */
  readonly perTryTimeoutMs: number
  readonly backoff: Backoff
}

/**
 * Worst-case wait before each retry. Returns `tries - 1` values: there is no
 * wait before the first attempt, and none after the last one.
 *
 * The series, with `i` counting retries from 0:
 *
 *   fixed               base
 *   exponential         base x multiplier^i          (gRPC's first retry waits
 *                                                     up to initial_backoff)
 *   envoy-exponential   (2^(i+1) - 1) x base         (Envoy: retry N is in
 *                                                     [0, (2^N - 1)B])
 *   decorrelated jitter base x 3^(i+1)               (AWS: next sleep is drawn
 *                                                     from [base, prev x 3],
 *                                                     starting from prev = base)
 *
 * all clamped at the cap. Full and equal jitter sample within `[0, w]`, so they
 * never lengthen the worst case; decorrelated jitter is stateful and its upper
 * bound compounds by three per step, which is why it gets its own series.
 */
export function backoffWaits(backoff: Backoff, tries: number): number[] {
  const n = Math.max(0, tries - 1)
  if (n === 0 || backoff.kind === 'none') return new Array(n).fill(0)

  const cap = backoff.capMs === 'none' ? Infinity : backoff.capMs
  const waits: number[] = []

  for (let i = 0; i < n; i++) {
    let w: number
    if (backoff.kind === 'fixed') {
      w = backoff.baseMs
    } else if (backoff.jitter === 'decorrelated') {
      w = backoff.baseMs * 3 ** (i + 1)
    } else if (backoff.kind === 'envoy-exponential') {
      w = (2 ** (i + 1) - 1) * backoff.baseMs
    } else {
      w = backoff.baseMs * Math.max(1, backoff.multiplier) ** i
    }
    waits.push(Math.min(cap, w))
  }
  return waits
}

/**
 * Mean wait before each retry, under the four jitter strategies AWS publishes.
 *
 * These are means of the sampled wait distribution, not observed latencies:
 *   none          w
 *   full          w / 2        sampled uniformly over [0, w]
 *   equal         3w / 4       w/2 plus a uniform sample over [0, w/2]
 *   decorrelated  no closed form; bounded above by the cap, so the bound is used
 */
export function meanBackoffWaits(backoff: Backoff, tries: number): number[] {
  const worst = backoffWaits(backoff, tries)
  switch (backoff.jitter) {
    case 'full':
      return worst.map((w) => w / 2)
    case 'equal':
      return worst.map((w) => (w * 3) / 4)
    case 'decorrelated':
    case 'none':
      return worst
  }
}

/** Worst-case elapsed time once `m` attempts of `attemptMs` have been spent. */
export function elapsedAfter(
  m: number,
  attemptMs: number,
  waits: readonly number[],
): number {
  if (m <= 0) return 0
  let total = m * attemptMs
  for (let i = 0; i < m - 1; i++) total += waits[i] ?? 0
  return total
}

export interface HopDeadline {
  readonly hopId: string
  /** Time this hop has for its whole call, retries included. */
  readonly availableMs: number
  /** Upper bound on one attempt, from this hop's own per-try timeout or its parent's. */
  readonly attemptBoundMs: number
  /** What the config asks for. */
  readonly configuredTries: number
  /** How many of those can complete inside `availableMs` in the worst case. */
  readonly reachableTries: number
  /** Worst-case waits used for the calculation. */
  readonly waits: readonly number[]
  /**
   * True when this hop configures no deadline of its own for a single attempt.
   * `attemptBoundMs` is still finite whenever *some* enclosing deadline exists,
   * because an attempt cannot outlast the timeout that kills it — but with no
   * per-attempt bound the worst case is that one attempt consumes the entire
   * window and the retries never start.
   */
  readonly noPerAttemptTimeout: boolean
  /** Worst-case time this hop takes before returning to its caller. */
  readonly worstCaseMs: number
}

/**
 * Resolves deadlines down the chain and back up again.
 *
 * Downward pass: how much time each hop actually has. A hop gets the smaller of
 * its own deadline and whatever its parent allows for one attempt — a 30s
 * timeout inside a parent that gives up after 2s is a 2s timeout.
 *
 * Upward pass: worst-case duration. A hop's attempt cannot outlast its own
 * per-try timeout, and cannot outlast its child's worst case either, so the
 * bound is the smaller of the two.
 */
export function resolveDeadlines(
  hops: readonly ResolvedHop[],
): HopDeadline[] {
  const n = hops.length
  if (n === 0) return []

  const availableMs = new Array<number>(n)
  const attemptBoundMs = new Array<number>(n)

  // Downward: what each hop is allowed.
  // The outermost hop's parent is a human, whose patience is not configuration.
  let parentAttemptAllowance = Infinity

  for (let h = 0; h < n; h++) {
    const hop = hops[h]!
    const coversRetries = hop.timeoutScope === 'includes-retries'

    // A per-attempt-scoped timeout does not bound the retry sequence at all,
    // which is exactly why a hop can spend far longer than its "timeout".
    const ownSequenceBound = coversRetries ? hop.timeoutMs : Infinity
    const available = Math.min(ownSequenceBound, parentAttemptAllowance)

    // The tightest per-attempt bound in force here.
    const ownAttemptBound = coversRetries ? Infinity : hop.timeoutMs
    const attemptBound = Math.min(hop.perTryTimeoutMs, ownAttemptBound, available)

    availableMs[h] = available
    attemptBoundMs[h] = attemptBound
    // What this hop hands its child for one attempt.
    parentAttemptAllowance = attemptBound
  }

  // Upward: worst-case duration, innermost first.
  const out = new Array<HopDeadline>(n)
  let childWorstCase = Infinity

  for (let h = n - 1; h >= 0; h--) {
    const hop = hops[h]!
    const available = availableMs[h]!
    const declaredAttemptBound = attemptBoundMs[h]!

    // An attempt ends when this hop's per-try timeout fires or when the child
    // returns, whichever comes first.
    const attemptMs = Math.min(declaredAttemptBound, childWorstCase)

    // Whether the hop bounds an attempt *itself*, as opposed to inheriting a
    // bound from an enclosing deadline. This is what the UI reports on, because
    // "you set no per-attempt timeout" is actionable and "the bound came out
    // finite" is not.
    const noPerAttemptTimeout =
      !Number.isFinite(hop.perTryTimeoutMs) &&
      !(hop.timeoutScope === 'per-attempt' && Number.isFinite(hop.timeoutMs))

    const waits = backoffWaits(hop.backoff, hop.totalTries)

    // Works for both bounded and unbounded cases: with an infinite attempt
    // bound and an infinite window, every elapsed total is Infinity <= Infinity
    // and all configured attempts survive.
    let reachableTries = 0
    for (let m = 1; m <= hop.totalTries; m++) {
      if (elapsedAfter(m, attemptMs, waits) <= available) reachableTries = m
      else break
    }
    // A hop always gets to start once, even when the budget is already spent.
    reachableTries = Math.max(1, reachableTries)

    const spent = elapsedAfter(reachableTries, attemptMs, waits)
    const worstCaseMs = Math.min(spent, available)

    out[h] = {
      hopId: hop.id,
      availableMs: available,
      attemptBoundMs: attemptMs,
      configuredTries: hop.totalTries,
      reachableTries,
      waits,
      noPerAttemptTimeout,
      worstCaseMs,
    }
    childWorstCase = worstCaseMs
  }

  return out
}

/** Worst-case time the outermost caller can wait. */
export function worstCaseUserLatencyMs(deadlines: readonly HopDeadline[]): number {
  return deadlines.length === 0 ? 0 : deadlines[0]!.worstCaseMs
}

export type BarKind = 'attempt' | 'wait'

export interface WaterfallBar {
  readonly kind: BarKind
  readonly index: number
  readonly startMs: number
  readonly endMs: number
  /** False for attempts the enclosing deadline makes impossible. */
  readonly reachable: boolean
}

/**
 * Lays out one hop's attempts and backoff gaps for the waterfall, including the
 * attempts that cannot run. Drawing the dead attempts is the whole point: the
 * gap between what was configured and what is reachable is invisible in config
 * and obvious on a timeline.
 */
export function waterfallBars(deadline: HopDeadline): WaterfallBar[] {
  const bars: WaterfallBar[] = []
  // Unbounded attempts have no width to draw; the UI shows a dedicated message.
  const attemptMs = Number.isFinite(deadline.attemptBoundMs)
    ? deadline.attemptBoundMs
    : deadline.availableMs

  let cursor = 0
  for (let i = 0; i < deadline.configuredTries; i++) {
    if (i > 0) {
      const wait = deadline.waits[i - 1] ?? 0
      if (wait > 0) {
        bars.push({
          kind: 'wait',
          index: i,
          startMs: cursor,
          endMs: cursor + wait,
          reachable: i < deadline.reachableTries,
        })
        cursor += wait
      }
    }
    bars.push({
      kind: 'attempt',
      index: i,
      startMs: cursor,
      endMs: cursor + attemptMs,
      reachable: i < deadline.reachableTries,
    })
    cursor += attemptMs
  }
  return bars
}
