/**
 * The domain contract.
 *
 * Two ideas drive the whole design and everything else follows from them.
 *
 * 1. Every hop field is a three-state value: DECLARED (the user told us),
 *    INHERITED (a vendor default we can cite), or UNKNOWN (the user said they
 *    do not know). UNKNOWN is a real, required state rather than an empty
 *    input, because the realistic session is an engineer who knows two of their
 *    six hops. A tool that treats "not filled in" as "no retries here" is wrong
 *    in the reassuring direction, which is the one direction we refuse to be
 *    wrong in.
 *
 * 2. `totalTries` is the number of attempts INCLUDING the first one, always.
 *    Vendors disagree with each other here — Istio's `retries.attempts` and
 *    Envoy's `num_retries` count *retries*, so `attempts: 2` means three calls
 *    leave the proxy. Normalising at the boundary means the off-by-one can only
 *    ever be wrong in one place (the layer registry and the config importers)
 *    instead of in every rule and every formula.
 */

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

/** Identifies a record in the citation registry. */
export type CitationId = string

export type FieldState = 'declared' | 'inherited' | 'unknown'

export type FieldValue<T> =
  | { readonly state: 'declared'; readonly value: T }
  /** A vendor default. `citationId` is required: an inherited value the tool
   *  cannot cite is indistinguishable from an invented one. */
  | { readonly state: 'inherited'; readonly value: T; readonly citationId: CitationId }
  | { readonly state: 'unknown' }

export function declared<T>(value: T): FieldValue<T> {
  return { state: 'declared', value }
}

export function inherited<T>(value: T, citationId: CitationId): FieldValue<T> {
  return { state: 'inherited', value, citationId }
}

export function unknown<T>(): FieldValue<T> {
  return { state: 'unknown' }
}

export function isKnown<T>(
  f: FieldValue<T>,
): f is Extract<FieldValue<T>, { value: T }> {
  return f.state !== 'unknown'
}

/** The value, or `fallback` when the field is UNKNOWN. */
export function valueOr<T>(f: FieldValue<T>, fallback: T): T {
  return f.state === 'unknown' ? fallback : f.value
}

// ---------------------------------------------------------------------------
// Timeouts and backoff
// ---------------------------------------------------------------------------

/**
 * A duration in whole milliseconds, or an explicit statement that no timeout is
 * configured. `'none'` is a declared fact ("this call can hang forever") and is
 * a completely different claim from UNKNOWN ("I don't know what it is").
 */
export type Duration = number | 'none'

export type JitterKind = 'none' | 'full' | 'equal' | 'decorrelated'

/**
 * `envoy-exponential` is Envoy's own series, which Istio inherits: the bound for
 * retry N is (2^N - 1) x base rather than base x 2^(N-1), so it cannot be
 * expressed as a plain exponential with a different multiplier.
 */
export type BackoffKind = 'none' | 'fixed' | 'exponential' | 'envoy-exponential'

export interface Backoff {
  readonly kind: BackoffKind
  /** Base wait in ms. Ignored when `kind` is `'none'`. */
  readonly baseMs: number
  /** Growth factor per retry. 2 for standard exponential; ignored unless exponential. */
  readonly multiplier: number
  /** Per-wait ceiling in ms, or `'none'` for uncapped growth. */
  readonly capMs: Duration
  readonly jitter: JitterKind
}

export const NO_BACKOFF: Backoff = {
  kind: 'none',
  baseMs: 0,
  multiplier: 1,
  capMs: 'none',
  jitter: 'none',
}

// ---------------------------------------------------------------------------
// Retry budgets
// ---------------------------------------------------------------------------

/**
 * The three incompatible things vendors call a "retry budget". These are not
 * different spellings of one quantity — they are different quantities:
 *
 *  - `envoy-concurrency-pct`: a percentage of *in-flight* requests that may be
 *    retries. A concurrency cap.
 *  - `rate-ratio`: retries as a fraction of *original requests* over a trailing
 *    window. A rate cap. Google SRE and Linkerd both use this shape.
 *  - `gateway-windowed-pct`: Gateway API GEP-3388. A percentage of requests,
 *    but counted over a window (10s by default), which makes it behave like a
 *    rate ratio despite borrowing Envoy's wording.
 *
 * Converting between them requires knowing throughput and latency, so the tool
 * asks for those rather than assuming them, and names the mismatch when
 * adjacent layers are configured in different units.
 */
export type BudgetKind =
  | 'envoy-concurrency-pct'
  | 'rate-ratio'
  | 'gateway-windowed-pct'

export interface RetryBudget {
  readonly kind: BudgetKind
  /** A percentage for Envoy and Gateway API, a ratio in [0, 1] for rate-ratio. */
  readonly value: number
  /**
   * The low-traffic allowance. Its unit follows the budget's own unit and the
   * floors are *not* interchangeable: Envoy's `min_retry_concurrency` is
   * concurrent retries, while Linkerd's `minRetriesPerSecond` and GEP-3388's
   * `minRetryRate` are retries per second.
   */
  readonly floor?: number
  /** Window in seconds, where the vendor defines one. */
  readonly windowSec?: number
}

// ---------------------------------------------------------------------------
// Failure classes
// ---------------------------------------------------------------------------

/**
 * Amplification is per failure class, not global. Istio's default `retryOn` is
 * `connect-failure,refused-stream,unavailable,cancelled`, which does not
 * include a plain HTTP 500 — so multiplying attempts for a 500 would overstate
 * the fan-out by the full product. A hop that does not retry the selected class
 * contributes a factor of exactly 1.
 */
export type FailureClassId =
  | 'connect-failure'
  | 'http-503'
  | 'http-500'
  | 'http-429'
  | 'grpc-unavailable'
  | 'attempt-timeout'

export interface FailureClass {
  readonly id: FailureClassId
  readonly label: string
  /** One line on why this class behaves differently from its neighbours. */
  readonly note: string
  /**
   * Vendor `retryOn` / `retryableStatusCodes` tokens that cause this class to
   * be retried. Matched case-insensitively against the hop's `retryOn`.
   */
  readonly matchedBy: readonly string[]
}

// ---------------------------------------------------------------------------
// Hops and chains
// ---------------------------------------------------------------------------

export type LayerTier = 'edge' | 'mesh' | 'sdk' | 'library' | 'app'

export interface Hop {
  readonly id: string
  readonly name: string
  /** A key into the layer registry, or `null` for a hand-entered generic hop. */
  readonly layerKindId: string | null
  /** Total calls this hop will make, including the first. Always >= 1. */
  readonly totalTries: FieldValue<number>
  /** The deadline this hop applies to its whole outbound call, retries included. */
  readonly timeoutMs: FieldValue<Duration>
  /** The deadline applied to each individual attempt. */
  readonly perTryTimeoutMs: FieldValue<Duration>
  /** Whether `timeoutMs` covers the retry sequence or one attempt. */
  readonly timeoutScope: TimeoutScope
  readonly backoff: FieldValue<Backoff>
  readonly budget: FieldValue<RetryBudget | null>
  /** Whether the work behind this hop is safe to repeat. */
  readonly idempotent: FieldValue<boolean>
  /** Vendor tokens, as written in the config. */
  readonly retryOn: FieldValue<readonly string[]>
  /**
   * Set when the user switches off a layer the registry says is on by default.
   * Requiring a reason keeps the audit trail honest: "I turned this off" and
   * "this was never on" are different claims.
   */
  readonly disabledReason?: string
}

/**
 * Whether a hop's configured timeout covers its retries or only one attempt.
 * Envoy documents that its route timeout "includes all retries"; other layers
 * apply the timeout per attempt. Getting this wrong inverts the deadline maths,
 * so it is carried per layer rather than assumed.
 */
export type TimeoutScope = 'includes-retries' | 'per-attempt'

export interface Chain {
  /** Bumped when the URL encoding changes shape, so old links refuse rather
   *  than silently decoding into something different. */
  readonly schemaVersion: number
  /** Index 0 is the outermost hop, nearest the user. */
  readonly hops: readonly Hop[]
  readonly failureClass: FailureClassId
  /** Throughput and latency, needed only by the budget translator. */
  readonly rps: FieldValue<number>
  readonly meanLatencyMs: FieldValue<number>
  /** Steady-state per-attempt failure probability, in [0, 1]. */
  readonly errorRate: FieldValue<number>
}

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

export type Severity = 'critical' | 'danger' | 'caution' | 'info'

/**
 * `needs-context` is a first-class outcome, not a soft pass. A rule whose
 * inputs include an UNKNOWN returns it explicitly instead of degrading into a
 * plausible number.
 */
export type Verdict = 'fail' | 'needs-context' | 'pass'

/** One line of the shown arithmetic behind a number. */
export interface AuditLine {
  readonly label: string
  readonly value: string
  /** Present when this line is a step in a calculation rather than an input. */
  readonly workings?: string
}

/**
 * A remedy is either a concrete field change backed by a citation, or a bare
 * statement of the constraint that was violated. The union makes it impossible
 * to print a recommended value without a citation to stand behind it — the
 * guarantee is enforced by the type, not by reviewer discipline.
 */
export type Remedy =
  | {
      readonly kind: 'set-field'
      readonly hopId: string
      readonly field: string
      readonly toValue: string
      readonly citationId: CitationId
    }
  | {
      readonly kind: 'constraint'
      /** e.g. "per-try timeout must be below the route timeout". */
      readonly constraint: string
      /** Why no number is offered: nobody authoritative publishes one. */
      readonly noAuthoritativeDefault: true
    }

export interface Finding {
  readonly ruleId: string
  readonly verdict: Verdict
  readonly severity: Severity
  readonly title: string
  /** Hops this finding is about, so the diagram can highlight them. */
  readonly hopIds: readonly string[]
  /** The documented consequence, stated in the direction that surprises people. */
  readonly consequence: string
  /** The finding rendered against this chain's actual values. */
  readonly detail: string
  readonly audit: readonly AuditLine[]
  readonly citations: readonly CitationId[]
  readonly remedy?: Remedy
}

// ---------------------------------------------------------------------------
// Citations and the layer registry
// ---------------------------------------------------------------------------

export interface Citation {
  readonly id: CitationId
  readonly product: string
  readonly title: string
  readonly url: string
  /** Verbatim from the page. Never a paraphrase — the quote is the evidence. */
  readonly quote: string
  /** The documented version this was read against. */
  readonly docVersion: string
  /** ISO date the quote was retrieved, so drift is visible. */
  readonly retrieved: string
}

export interface LayerDefault<T> {
  readonly value: T
  readonly citationId: CitationId
  /** Any condition on the default being in force, e.g. "unless overridden". */
  readonly appliesWhen?: string
}

/**
 * A layer the user can drop into the path. Selecting one instantiates a hop
 * whose fields are INHERITED from these defaults, each carrying its citation.
 * Absence is meaningful: a layer with no `totalTries` default does not retry
 * unless configured, and the UI says so rather than leaving it blank.
 */
export interface LayerKind {
  readonly id: string
  readonly product: string
  readonly label: string
  readonly tier: LayerTier
  /** One line for the picker. */
  readonly blurb: string
  /**
   * How this layer's timeout relates to its retries. Cited where the vendor
   * states it; `citationId` is absent only where the semantics are structural
   * (e.g. a per-connection proxy timeout) rather than a documented default.
   */
  readonly timeoutScope: { readonly value: TimeoutScope; readonly citationId?: CitationId }
  readonly defaults: {
    readonly totalTries?: LayerDefault<number>
    readonly timeoutMs?: LayerDefault<Duration>
    readonly perTryTimeoutMs?: LayerDefault<Duration>
    readonly backoff?: LayerDefault<Backoff>
    readonly budget?: LayerDefault<RetryBudget | null>
    readonly retryOn?: LayerDefault<readonly string[]>
    readonly idempotent?: LayerDefault<boolean>
  }
  /**
   * A built-in mechanism that stops retrying under sustained failure even with
   * no budget configured — AWS standard mode's retry quota, for example. Rules
   * that ask "does anything bound retries?" must count these.
   */
  readonly retryLimiter?: { readonly description: string; readonly citationId: CitationId }
  /**
   * The thing about this layer that surprises people. Shown on the inherited
   * badge, because it is the reason the layer registry exists at all.
   */
  readonly surprise?: string
  /** Config keys the importer recognises, for the "not modeled" report. */
  readonly configKeys?: readonly string[]
}
