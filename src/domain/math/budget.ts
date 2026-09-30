import type { RetryBudget } from '../model'

/**
 * Cross-vendor retry-budget translation.
 *
 * The same engineer can be simultaneously configuring three caps that are not
 * the same quantity:
 *
 *   Envoy         a percentage of *in-flight* requests that may be retries
 *                 (a concurrency cap)
 *   SRE, Linkerd  retries as a fraction of *original requests per second*
 *                 (a rate cap)
 *   Gateway API   an absolute *retries per second* allowance with a floor
 *
 * No vendor publishes a conversion between them, so this module converts only
 * where Little's law lets it, and marks every converted figure as resting on
 * the user's latency input. Where a figure cannot be derived, it says so
 * instead of producing a number.
 */

/** Concurrency implied by throughput and latency: C = R x L. Little's law. */
export function concurrencyFromLoad(rps: number, meanLatencyMs: number): number {
  return rps * (meanLatencyMs / 1000)
}

export type BudgetUnit = 'concurrent-retries' | 'retries-per-second'

export interface BudgetAllowance {
  /** The unit the vendor natively expresses this cap in. */
  readonly nativeUnit: BudgetUnit
  /** The cap in its native unit. */
  readonly native: number
  /** The same cap as concurrent retries, or null when not derivable. */
  readonly asConcurrentRetries: number | null
  /** The same cap as retries per second, or null when not derivable. */
  readonly asRetriesPerSecond: number | null
  /** True when the conversion required the user's mean-latency input. */
  readonly usedLatencyAssumption: boolean
  /** How the native figure was arrived at, for the audit trail. */
  readonly workings: string
}

export interface LoadInput {
  readonly rps: number
  /** Null when only throughput is known: rates still resolve, concurrency does not. */
  readonly meanLatencyMs: number | null
}

/**
 * Translates one vendor's budget into both units.
 *
 * `load` is the healthy baseline at this hop — traffic before any retries
 * start. That matters because the budgets disagree about their denominator:
 * Envoy and Gateway API count retries as part of "active requests", so once a
 * storm begins the retries inflate their own allowance, while Linkerd measures
 * against original requests only. Figures here are the allowance at the moment
 * retries begin, which is the moment that decides whether a storm gets going.
 *
 * The concurrency/rate conversion is Little's law rearranged and is exact only
 * while the stated latency holds. During the brownout these budgets exist to
 * contain, latency rises and the conversion drifts — so the result carries
 * `usedLatencyAssumption` instead of presenting a converted number as
 * equivalent.
 */
export function translateBudget(
  budget: RetryBudget,
  load: LoadInput | null,
): BudgetAllowance {
  const latencySec =
    load && load.meanLatencyMs !== null ? load.meanLatencyMs / 1000 : null
  const concurrency =
    load && load.meanLatencyMs !== null
      ? concurrencyFromLoad(load.rps, load.meanLatencyMs)
      : null
  const floor = budget.floor ?? 0
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

  switch (budget.kind) {
    case 'envoy-concurrency-pct': {
      const fromPct =
        concurrency === null ? null : (budget.value / 100) * concurrency
      const native = fromPct === null ? floor : Math.max(floor, fromPct)
      return {
        nativeUnit: 'concurrent-retries',
        native,
        asConcurrentRetries: native,
        asRetriesPerSecond:
          fromPct !== null && latencySec !== null && latencySec > 0
            ? native / latencySec
            : null,
        usedLatencyAssumption: true,
        workings:
          concurrency === null
            ? `floor of ${fmt(floor)} concurrent retries; the percentage needs throughput and latency to resolve`
            : `max(${fmt(floor)}, ${fmt(budget.value)}% x ${fmt(concurrency)} in flight) = ${fmt(native)} concurrent retries`,
      }
    }

    case 'rate-ratio':
    case 'gateway-windowed-pct': {
      // Linkerd and SRE state a ratio (0.2); Gateway API states a percent (20).
      const ratio =
        budget.kind === 'rate-ratio' ? budget.value : budget.value / 100
      const fromRatio = load === null ? null : ratio * load.rps
      const native = fromRatio === null ? floor : Math.max(floor, fromRatio)
      const label =
        budget.kind === 'rate-ratio'
          ? `${fmt(ratio * 100)}% of requests`
          : `${fmt(budget.value)}% of requests over ${budget.windowSec ?? 10}s`
      return {
        nativeUnit: 'retries-per-second',
        native,
        asConcurrentRetries:
          fromRatio !== null && latencySec !== null ? native * latencySec : null,
        asRetriesPerSecond: fromRatio === null && floor === 0 ? null : native,
        usedLatencyAssumption: false,
        workings:
          fromRatio === null
            ? floor > 0
              ? `floor of ${fmt(floor)} retries/s; the ratio needs throughput to resolve`
              : 'needs throughput to resolve'
            : `max(${fmt(floor)}, ${label} at ${fmt(load!.rps)} req/s) = ${fmt(native)} retries/s`,
      }
    }
  }
}

/** Whether two budgets are expressed in units that can be compared directly. */
export function unitsAgree(a: RetryBudget, b: RetryBudget): boolean {
  const unit = (k: RetryBudget['kind']): BudgetUnit =>
    k === 'envoy-concurrency-pct' ? 'concurrent-retries' : 'retries-per-second'
  return unit(a.kind) === unit(b.kind)
}

/**
 * The retry rate a chain would actually try to issue at a given per-attempt
 * error rate, so it can be held against the budgets above.
 *
 * `retryRatio` comes from the amplification model (expected attempts minus the
 * one original call), so this is the same number the curve plots, expressed as
 * a rate rather than a ratio.
 */
export function impliedRetryRate(rps: number, retryRatio: number): number {
  return rps * retryRatio
}
