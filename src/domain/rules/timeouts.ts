import type { HopFacts } from '../analyze'
import { fmtMs, fmtTries, plural } from '../format'
import type { Finding } from '../model'
import { finding, isEnvoyBased, sum, type Rule } from './types'

/**
 * RB1xx — timeout structure.
 *
 * These rules are about the shape of the deadlines, independent of which
 * failure is being analysed: an attempt your deadlines make impossible is
 * impossible whether the dependency is refusing connections or timing out.
 */

/** The per-try timeout is at or above the hop's own overall timeout. */
function perTryNotBelowTimeout(f: HopFacts): boolean {
  return (
    f.totalTries > 1 &&
    f.hop.timeoutScope === 'includes-retries' &&
    f.timeoutKnown &&
    f.perTryKnown &&
    Number.isFinite(f.timeoutMs) &&
    Number.isFinite(f.perTryTimeoutMs) &&
    f.perTryTimeoutMs >= f.timeoutMs
  )
}

/** Largest per-attempt timeout that lets every configured attempt fit. */
function perTryThatFits(f: HopFacts, windowMs: number): number {
  return Math.floor((windowMs - sum(f.deadline.waits)) / f.totalTries)
}

export const RB101: Rule = {
  id: 'RB101',
  title: 'Per-try timeout is ignored',
  severity: 'critical',
  detects:
    'A per-attempt timeout that is not strictly below the hop’s overall timeout, on a hop that retries.',
  falsePositives:
    'Deliberate only if you want a single long attempt — in which case the retries configured on this hop cannot run and should be removed.',
  citations: ['envoy-per-try-ignored', 'envoy-retries-within-timeout'],
  run(a) {
    const out: Finding[] = []
    for (const f of a.facts) {
      if (!perTryNotBelowTimeout(f)) continue
      const T = f.timeoutMs
      const Y = f.perTryTimeoutMs
      const fit = perTryThatFits(f, T)
      const envoy = isEnvoyBased(f)
      out.push(
        finding(this, {
          hops: [f],
          consequence: envoy
            ? 'Envoy does not clamp it — it drops it. You do not get longer attempts; you get one attempt that can use the whole deadline.'
            : 'It can never fire before the overall timeout, so one slow attempt consumes the whole budget and the retries never start.',
          detail: envoy
            ? `${f.hop.name}: the per-try timeout (${fmtMs(Y)}) is not below the route timeout (${fmtMs(T)}), so Envoy ignores it. The first attempt may run the full ${fmtMs(T)}, leaving no time for the other ${plural(f.totalTries - 1, 'retry', 'retries')}.`
            : `${f.hop.name}: the per-attempt timeout (${fmtMs(Y)}) is not below the overall timeout (${fmtMs(T)}), so a single slow attempt uses the entire budget.`,
          audit: [
            { label: 'Overall timeout', value: fmtMs(T) },
            { label: 'Per-try timeout', value: fmtMs(Y) },
            { label: 'Configured', value: fmtTries(f.totalTries) },
            {
              label: 'Reachable in the worst case',
              value: plural(f.deadline.reachableTries, 'attempt'),
              workings: `per-try ${fmtMs(Y)} >= overall ${fmtMs(T)}, so each attempt is bounded only by ${fmtMs(T)}`,
            },
          ],
          remedy:
            fit > 0
              ? {
                  kind: 'set-field',
                  hopId: f.hop.id,
                  field: 'perTryTimeoutMs',
                  toValue: fmtMs(fit),
                  raw: fit,
                  citationId: 'envoy-per-try-ignored',
                }
              : {
                  kind: 'constraint',
                  constraint: `The per-try timeout must be below ${fmtMs(T)}, and ${f.totalTries} attempts plus backoff do not fit in ${fmtMs(T)} at any per-try value — reduce the attempts or raise the overall timeout.`,
                  noAuthoritativeDefault: true,
                },
        }),
      )
    }
    return out
  },
}

export const RB102: Rule = {
  id: 'RB102',
  title: 'Retries that can never run',
  severity: 'danger',
  detects:
    'A hop whose configured attempts, per-attempt timeouts and backoff cannot all fit inside the time it actually has.',
  falsePositives:
    'The count is a worst case: it assumes each attempt runs to its timeout. Attempts that fail fast (a refused connection) can all run — which is exactly when they amplify load.',
  citations: ['envoy-retries-within-timeout', 'istio-attempts-semantics'],
  run(a) {
    const out: Finding[] = []
    for (const f of a.facts) {
      const d = f.deadline
      if (f.totalTries < 2) continue
      if (d.reachableTries >= f.totalTries) continue
      if (!Number.isFinite(d.availableMs)) continue
      // RB101 already explains this hop, and names the cause more precisely.
      if (perTryNotBelowTimeout(f)) continue

      const ownT = f.hop.timeoutScope === 'includes-retries' ? f.timeoutMs : Infinity
      const squeezedByCaller = d.availableMs < ownT
      const where = squeezedByCaller
        ? `${fmtMs(d.availableMs)} (its caller allows only that much per attempt)`
        : fmtMs(d.availableMs)
      const waits = sum(d.waits.slice(0, f.totalTries - 1))
      const needed = f.totalTries * d.attemptBoundMs + waits
      const fit = perTryThatFits(f, d.availableMs)

      out.push(
        finding(this, {
          hops: [f],
          consequence:
            'Tightening a deadline removes attempts instead of shortening them. The retries in the config are not the retries you have.',
          detail: d.noPerAttemptTimeout
            ? `${f.hop.name}: configured for ${f.totalTries} attempts but has no per-attempt timeout, so in the worst case the first attempt runs until the ${where} deadline and the other ${plural(f.totalTries - 1, 'retry', 'retries')} never start.`
            : `${f.hop.name}: ${f.totalTries} attempts of up to ${fmtMs(d.attemptBoundMs)} plus ${fmtMs(waits)} of backoff need ${fmtMs(needed)}, but it has ${where}. Only ${plural(d.reachableTries, 'attempt')} can run.`,
          audit: [
            { label: 'Time available', value: fmtMs(d.availableMs) },
            {
              label: 'Per attempt, worst case',
              value: d.noPerAttemptTimeout ? `${fmtMs(d.attemptBoundMs)} (no per-attempt timeout)` : fmtMs(d.attemptBoundMs),
            },
            { label: 'Backoff before each retry', value: d.waits.map(fmtMs).join(', ') || 'none' },
            { label: 'Configured', value: fmtTries(f.totalTries) },
            {
              label: 'Reachable',
              value: plural(d.reachableTries, 'attempt'),
              workings: `largest m with m x ${fmtMs(d.attemptBoundMs)} + backoff <= ${fmtMs(d.availableMs)}`,
            },
          ],
          remedy:
            fit > 0
              ? {
                  kind: 'set-field',
                  hopId: f.hop.id,
                  field: 'perTryTimeoutMs',
                  toValue: fmtMs(fit),
                  raw: fit,
                  citationId: 'envoy-per-try-ignored',
                }
              : {
                  kind: 'constraint',
                  constraint: `${f.totalTries} attempts plus backoff cannot fit in ${fmtMs(d.availableMs)}. Reduce the attempts, shorten the backoff, or give this hop more time.`,
                  noAuthoritativeDefault: true,
                },
        }),
      )
    }
    return out
  },
}

export const RB103: Rule = {
  id: 'RB103',
  title: 'Keeps working after its caller gave up',
  severity: 'caution',
  detects:
    'A hop whose own deadline is longer than the time its caller allows one attempt, or which has no deadline under a caller that does.',
  falsePositives:
    'Harmless for work that must finish regardless of the caller (a write that commits asynchronously). For request/response work it is wasted capacity during exactly the incident that is short of it.',
  citations: ['grpc-deadline-propagation', 'grpc-wasted-work'],
  run(a) {
    const out: Finding[] = []
    for (const f of a.facts.slice(1)) {
      const d = f.deadline
      if (!f.timeoutKnown || f.hop.timeoutScope !== 'includes-retries') continue
      if (!Number.isFinite(d.availableMs)) continue
      if (d.availableMs >= f.timeoutMs) continue

      const caller = a.facts[f.index - 1]!
      const unbounded = !Number.isFinite(f.timeoutMs)
      out.push(
        finding(this, {
          hops: [caller, f],
          consequence:
            'The caller abandons the request while this hop keeps waiting on — and retrying — its dependency, spending capacity on an answer nobody will read.',
          detail: unbounded
            ? `${caller.hop.name} gives ${f.hop.name} ${fmtMs(d.availableMs)} per attempt, but ${f.hop.name} has no timeout of its own and keeps going after its caller has moved on.`
            : `${caller.hop.name} gives ${f.hop.name} ${fmtMs(d.availableMs)} per attempt, but ${f.hop.name}'s own timeout is ${fmtMs(f.timeoutMs)}: up to ${fmtMs(f.timeoutMs - d.availableMs)} of work after the caller has given up.`,
          audit: [
            { label: `${caller.hop.name} allows per attempt`, value: fmtMs(d.availableMs) },
            { label: `${f.hop.name} timeout`, value: fmtMs(f.timeoutMs) },
          ],
          remedy: {
            kind: 'constraint',
            constraint: `${f.hop.name}'s timeout should be below the ${fmtMs(d.availableMs)} its caller allows, so it stops when its caller does.`,
            noAuthoritativeDefault: true,
          },
        }),
      )
    }
    return out
  },
}

export const RB104: Rule = {
  id: 'RB104',
  title: 'No deadline anywhere on the path',
  severity: 'danger',
  detects: 'A path on which no hop bounds how long the user can be kept waiting.',
  falsePositives:
    'None for request/response traffic. Long-lived streams are out of scope for this tool.',
  citations: ['grpc-no-default-deadline', 'istio-route-timeout'],
  run(a) {
    if (a.facts.length === 0 || Number.isFinite(a.userLatencyMs)) return []
    const unknownTimeouts = a.facts.filter(
      (f) => !f.timeoutKnown || (f.totalTries > 1 && !f.perTryKnown),
    )
    if (unknownTimeouts.length > 0) {
      return [
        finding(this, {
          verdict: 'needs-context',
          severity: 'info',
          title: 'No deadline declared on the path',
          hops: unknownTimeouts,
          consequence:
            'If none of the unknown timeouts is actually set, a hung dependency holds the user — and every hop in between — indefinitely.',
          detail: `Nothing declared on this path bounds the wait. ${plural(unknownTimeouts.length, 'hop has', 'hops have')} a timeout you marked unknown; fill those in to settle it.`,
          audit: unknownTimeouts.map((f) => ({ label: f.hop.name, value: 'timeout unknown' })),
        }),
      ]
    }
    return [
      finding(this, {
        hops: a.facts,
        consequence:
          'A hung dependency holds the user, and every hop in between, indefinitely. Nothing on this path will ever give up.',
        detail:
          'Every hop on this path is configured with no timeout, so a dependency that stops responding without closing the connection is waited on forever.',
        audit: a.facts.map((f) => ({ label: f.hop.name, value: 'no timeout' })),
        remedy: {
          kind: 'constraint',
          constraint:
            'Set a deadline at the outermost hop and a shorter one at each hop inside it.',
          noAuthoritativeDefault: true,
        },
      }),
    ]
  },
}

export const TIMEOUT_RULES: readonly Rule[] = [RB101, RB102, RB103, RB104]
