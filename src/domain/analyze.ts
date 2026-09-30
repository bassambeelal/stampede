import {
  amplificationCurve,
  cumulativeWorstCase,
  expectedAmplification,
  retryRatioPerHop,
  type CurvePoint,
} from './math/amplification'
import {
  resolveDeadlines,
  worstCaseUserLatencyMs,
  type HopDeadline,
  type ResolvedHop,
} from './math/deadline'
import {
  NO_BACKOFF,
  type Backoff,
  type Chain,
  type Duration,
  type FieldValue,
  type Finding,
  type Hop,
  type LayerKind,
  type RetryBudget,
} from './model'
import { retriesClass } from './registry/failureClasses'
import { layerKind } from './registry/layers'
import { runRules } from './rules'

/**
 * Everything the rules and the UI need to know about one hop, resolved from
 * three-state fields into plain values plus a record of what was assumed.
 *
 * The resolution policy is chosen so that an UNKNOWN can only ever make the
 * answer *look worse* than the truth for amplification — never better — and is
 * always recorded so the UI can say what it assumed:
 *
 *   unknown tries        counted as 1, and the headline becomes "at least"
 *   unknown retryOn      assumed to retry the selected failure class
 *   unknown backoff      assumed to be zero, which admits the most attempts
 *   unknown timeouts     treated as unbounded
 */
export interface HopFacts {
  readonly hop: Hop
  readonly index: number
  readonly layer: LayerKind | undefined
  readonly totalTries: number
  readonly triesKnown: boolean
  /** Whether this hop retries the failure class being analysed. */
  readonly retriesThisClass: boolean
  /** True when `retriesThisClass` rests on an assumption, not on config. */
  readonly retryOnAssumed: boolean
  /** Tries that apply to this class: `totalTries`, or 1 if the class is not retried. */
  readonly effectiveTries: number
  /**
   * Tries that actually multiply load. For a timeout, each attempt runs to its
   * deadline, so only the attempts the deadlines leave room for can happen;
   * fast failures (a refused connection, a 503) are not truncated this way.
   */
  readonly amplifyingTries: number
  readonly timeoutMs: number
  readonly timeoutKnown: boolean
  readonly perTryTimeoutMs: number
  readonly perTryKnown: boolean
  readonly backoff: Backoff
  readonly backoffKnown: boolean
  readonly budget: RetryBudget | null
  readonly budgetKnown: boolean
  readonly idempotent: boolean | null
  readonly deadline: HopDeadline
}

export type AmplificationQualifier = 'exact' | 'at-least'

export interface Analysis {
  readonly chain: Chain
  readonly facts: readonly HopFacts[]
  /** Worst-case calls arriving at each hop, for the selected failure class. */
  readonly cumulative: readonly number[]
  readonly amplification: number
  /** `at-least` whenever a hop's try count is unknown and was counted as 1. */
  readonly qualifier: AmplificationQualifier
  readonly curve: readonly CurvePoint[]
  /** Expected amplification at the declared steady-state error rate, if given. */
  readonly expectedAtErrorRate: number | null
  /** Retry ratio each hop would run at the declared error rate, if given. */
  readonly retryRatios: readonly number[] | null
  readonly userLatencyMs: number
  readonly findings: readonly Finding[]
}

const toMs = (f: FieldValue<Duration>): { ms: number; known: boolean } =>
  f.state === 'unknown'
    ? { ms: Infinity, known: false }
    : { ms: f.value === 'none' ? Infinity : f.value, known: true }

function baseFacts(chain: Chain): Omit<HopFacts, 'deadline' | 'amplifyingTries'>[] {
  return chain.hops.map((hop, index) => {
    const triesKnown = hop.totalTries.state !== 'unknown'
    const totalTries = triesKnown
      ? Math.max(1, Math.floor((hop.totalTries as { value: number }).value))
      : 1

    // With one attempt, which failures are "retryable" is moot.
    let retriesThisClass = false
    let retryOnAssumed = false
    if (totalTries > 1) {
      if (hop.retryOn.state === 'unknown') {
        retriesThisClass = true
        retryOnAssumed = true
      } else {
        retriesThisClass = retriesClass(hop.retryOn.value, chain.failureClass)
      }
    }

    const timeout = toMs(hop.timeoutMs)
    const perTry = toMs(hop.perTryTimeoutMs)

    return {
      hop,
      index,
      layer: hop.layerKindId ? layerKind(hop.layerKindId) : undefined,
      totalTries,
      triesKnown,
      retriesThisClass,
      retryOnAssumed,
      effectiveTries: retriesThisClass ? totalTries : 1,
      timeoutMs: timeout.ms,
      timeoutKnown: timeout.known,
      perTryTimeoutMs: perTry.ms,
      perTryKnown: perTry.known,
      backoff: hop.backoff.state === 'unknown' ? NO_BACKOFF : hop.backoff.value,
      backoffKnown: hop.backoff.state !== 'unknown',
      budget: hop.budget.state === 'unknown' ? null : hop.budget.value,
      budgetKnown: hop.budget.state !== 'unknown',
      idempotent: hop.idempotent.state === 'unknown' ? null : hop.idempotent.value,
    }
  })
}

export function analyze(chain: Chain): Analysis {
  const partial = baseFacts(chain)

  const resolved: ResolvedHop[] = partial.map((f) => ({
    id: f.hop.id,
    totalTries: f.totalTries,
    effectiveTries: f.effectiveTries,
    timeoutMs: f.timeoutMs,
    timeoutScope: f.hop.timeoutScope,
    perTryTimeoutMs: f.perTryTimeoutMs,
    backoff: f.backoff,
  }))
  const deadlines = resolveDeadlines(resolved)

  const truncatesAttempts = chain.failureClass === 'attempt-timeout'
  const facts: HopFacts[] = partial.map((f, i) => {
    const deadline = deadlines[i]!
    const amplifyingTries = truncatesAttempts
      ? Math.min(f.effectiveTries, deadline.reachableTries)
      : f.effectiveTries
    return { ...f, deadline, amplifyingTries }
  })

  const tries = facts.map((f) => f.amplifyingTries)
  const cumulative = cumulativeWorstCase(tries)
  const amplification = cumulative.length ? cumulative[cumulative.length - 1]! : 1
  const qualifier: AmplificationQualifier = facts.some((f) => !f.triesKnown)
    ? 'at-least'
    : 'exact'

  const p = chain.errorRate.state === 'unknown' ? null : chain.errorRate.value
  const expectedAtErrorRate = p === null ? null : expectedAmplification(p, tries)
  // The ratio a hop's own budget sees depends on its configured tries, not on
  // the deadline truncation, which only applies once attempts start timing out.
  const retryRatios =
    p === null ? null : retryRatioPerHop(p, facts.map((f) => f.effectiveTries))

  const base = {
    chain,
    facts,
    cumulative,
    amplification,
    qualifier,
    curve: amplificationCurve(tries),
    expectedAtErrorRate,
    retryRatios,
    userLatencyMs: worstCaseUserLatencyMs(deadlines),
  }
  return { ...base, findings: runRules(base) }
}

export type AnalysisInput = Omit<Analysis, 'findings'>
