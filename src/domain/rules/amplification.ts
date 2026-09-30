import { fmtPct, fmtTries, fmtX, listNames, plural } from '../format'
import { unitsAgree } from '../math/budget'
import type { BudgetKind, CitationId, Finding } from '../model'
import { failureClass } from '../registry/failureClasses'
import { finding, type Rule } from './types'

/**
 * RB2xx — amplification and budgets. These depend on the failure class being
 * analysed, because a hop only multiplies the failures it actually retries.
 */

export const RB201: Rule = {
  id: 'RB201',
  title: 'Retries at more than one layer',
  severity: 'danger',
  detects: 'Two or more hops on one path that both retry the failure being analysed.',
  falsePositives:
    'Layered retries can be deliberate when each layer retries a disjoint failure class. Switch the failure class to check: this rule only counts hops that retry the selected one.',
  citations: ['aws-retry-one-level', 'sre-amplification-64'],
  run(a) {
    // The same per-hop factor the headline multiplies, so the two can never
    // disagree: attempts a deadline makes impossible do not multiply anything.
    const retrying = a.facts.filter((f) => f.amplifyingTries > 1)
    if (retrying.length < 2) return []
    const cls = failureClass(a.chain.failureClass)
    const product = retrying.map((f) => f.amplifyingTries).join(' × ')
    const total = retrying.reduce((n, f) => n * f.amplifyingTries, 1)
    const assumed = retrying.filter((f) => f.retryOnAssumed)
    return [
      finding(this, {
        hops: retrying,
        consequence:
          'Layered retries multiply rather than add. During an outage the innermost dependency receives the product of every layer’s attempts, at the moment it can least absorb them.',
        detail: `${listNames(retrying.map((f) => f.hop.name))} all retry “${cls.label}”, so one failed request becomes ${product} = ${fmtX(total)} calls at the innermost of them.${
          assumed.length
            ? ` (${listNames(assumed.map((f) => f.hop.name))} ${assumed.length === 1 ? 'is' : 'are'} assumed to retry it because the retry conditions are unknown.)`
            : ''
        }`,
        audit: retrying.map((f) => ({ label: f.hop.name, value: fmtTries(f.amplifyingTries) })),
        remedy: {
          kind: 'constraint',
          constraint:
            'Retry at one layer only and set every other layer on this path to a single attempt (in Istio, attempts: 0).',
          noAuthoritativeDefault: true,
        },
      }),
    ]
  },
}

export const RB202: Rule = {
  id: 'RB202',
  title: 'Retry layers you never configured',
  severity: 'caution',
  detects: 'Hops that retry only because their vendor’s default says so.',
  falsePositives:
    'If you have overridden a default somewhere the tool cannot see (MeshConfig, an environment variable, a shared client factory), declare the real value on the hop.',
  citations: [],
  run(a) {
    const inherited = a.facts.filter(
      (f) => f.hop.totalTries.state === 'inherited' && f.effectiveTries > 1,
    )
    if (inherited.length === 0) return []

    const cites = new Set<CitationId>()
    for (const f of inherited) {
      if (f.hop.totalTries.state === 'inherited') cites.add(f.hop.totalTries.citationId)
      if (f.hop.retryOn.state === 'inherited') cites.add(f.hop.retryOn.citationId)
    }
    const product = inherited.reduce((n, f) => n * f.effectiveTries, 1)
    const one = inherited.length === 1
    return [
      finding(this, {
        title: one ? 'Retry layer you never configured' : `${inherited.length} retry layers you never configured`,
        hops: inherited,
        citations: [...cites],
        consequence:
          'Engineers reason about the retries they wrote. These were switched on by defaults, so they are in nobody’s review and nobody’s mental model of the system.',
        detail: `${listNames(inherited.map((f) => `${f.hop.name} (${f.layer?.product ?? 'vendor'}, ${f.totalTries} calls)`))} ${one ? 'retries' : 'retry'} without a single retry setting being written${one ? '' : ` — ${fmtX(product)} between them`}.`,
        audit: inherited.map((f) => ({
          label: f.hop.name,
          value: `${f.layer?.product ?? 'vendor'} default: ${fmtTries(f.totalTries)}`,
          workings: f.layer?.defaults.totalTries?.appliesWhen,
        })),
        remedy: {
          kind: 'constraint',
          constraint:
            'Write each layer’s retry policy into its configuration explicitly — keep it or turn it off, but make it a decision that shows up in review.',
          noAuthoritativeDefault: true,
        },
      }),
    ]
  },
}

export const RB203: Rule = {
  id: 'RB203',
  title: 'More tries than the SRE per-request budget',
  severity: 'caution',
  detects: 'A single hop allowed more than three calls for one request.',
  falsePositives:
    'The SRE book states this as its own client library’s policy, not a universal law. It is cited as the most authoritative published per-request figure there is.',
  citations: ['sre-per-request-budget'],
  run(a) {
    return a.facts
      .filter((f) => f.triesKnown && f.totalTries > 3)
      .map((f) =>
        finding(this, {
          hops: [f],
          consequence:
            'Each extra try is another full request against a dependency that has already failed the first three.',
          detail: `${f.hop.name} allows ${fmtTries(f.totalTries)}. Google’s client library lets a request fail three times and then returns the error to the caller.`,
          audit: [
            { label: 'Configured', value: fmtTries(f.totalTries) },
            { label: 'SRE per-request budget', value: '3 calls' },
          ],
          remedy: {
            kind: 'set-field',
            hopId: f.hop.id,
            field: 'totalTries',
            toValue: '3 calls (1 + 2 retries)',
            raw: 3,
            citationId: 'sre-per-request-budget',
          },
        }),
      )
  },
}

export const RB204: Rule = {
  id: 'RB204',
  title: 'Steady-state retries above the 10% budget',
  severity: 'caution',
  detects:
    'At the error rate you declared, a hop spending more than 10% of its calls on retries.',
  falsePositives:
    'The expected ratio assumes attempts fail independently. Real failures are correlated, so the true ratio during an incident is higher than this, not lower.',
  citations: ['sre-client-retry-ratio', 'linkerd-retry-budget', 'gep-3388-budget'],
  run(a) {
    if (!a.retryRatios || a.chain.errorRate.state === 'unknown') return []
    const p = a.chain.errorRate.value
    const out: Finding[] = []
    a.facts.forEach((f, i) => {
      const ratio = a.retryRatios![i]!
      if (ratio <= 0.1) return
      out.push(
        finding(this, {
          hops: [f],
          consequence:
            'A client over its retry ratio is adding load in proportion to how badly its dependency is doing — the feedback loop a budget exists to break.',
          detail: `At a ${fmtPct(p)} per-attempt error rate, ${f.hop.name} spends ${fmtPct(ratio)} of its calls on retries: above the 10% the SRE book’s clients stop at${ratio > 0.2 ? ', and above the 20% Linkerd and Gateway API allow by default' : ''}.`,
          audit: [
            { label: 'Declared error rate', value: fmtPct(p) },
            { label: 'Tries', value: fmtTries(f.effectiveTries) },
            {
              label: 'Retry ratio',
              value: fmtPct(ratio),
              workings: `(1 - p^t) / (1 - p) - 1 with p = ${p}, t = ${f.effectiveTries}`,
            },
          ],
        }),
      )
    })
    return out
  },
}

export const RB205: Rule = {
  id: 'RB205',
  title: 'Nothing bounds retries during an outage',
  severity: 'caution',
  detects: 'Hops that retry with no retry budget or built-in retry quota behind them.',
  falsePositives:
    'A circuit breaker or load shedder the tool does not model may cap retries in practice. Budgets are enforced against live traffic, which config alone cannot show.',
  citations: ['sre-client-retry-ratio', 'envoy-retry-budget', 'gep-3388-budget'],
  run(a) {
    const retrying = a.facts.filter((f) => f.effectiveTries > 1)
    const unbounded = retrying.filter((f) => !(f.budget || f.layer?.retryLimiter))
    if (unbounded.length === 0) return []
    const unknowns = unbounded.filter((f) => !f.budgetKnown)
    const names = listNames(unbounded.map((f) => f.hop.name))
    if (unknowns.length > 0) {
      return [
        finding(this, {
          verdict: 'needs-context',
          severity: 'info',
          title: 'No retry budget declared',
          hops: unbounded,
          consequence:
            'Without a budget, every configured retry is spent during an outage — the worst case stops being hypothetical.',
          detail: `${names} ${unbounded.length === 1 ? 'retries' : 'retry'} with no budget or quota declared. Whether one exists (an Envoy retry budget, a client-side ratio) is unknown for ${plural(unknowns.length, 'hop')}.`,
          audit: unknowns.map((f) => ({ label: f.hop.name, value: 'budget unknown' })),
        }),
      ]
    }
    return [
      finding(this, {
        hops: unbounded,
        consequence:
          'Without a budget, every configured retry is spent during an outage, so the worst-case amplification is not a bound — it is what happens.',
        detail: `${names} ${unbounded.length === 1 ? 'retries' : 'retry'} with no budget or quota, so nothing stops the ${fmtX(a.amplification)} worst case once failures are sustained.`,
        audit: unbounded.map((f) => ({ label: f.hop.name, value: 'no budget' })),
        remedy: {
          kind: 'constraint',
          constraint:
            'Put a retry budget on at least the retrying hops closest to the failing dependency.',
          noAuthoritativeDefault: true,
        },
      }),
    ]
  },
}

const UNIT_NAME: Record<BudgetKind, string> = {
  'envoy-concurrency-pct': 'a share of in-flight requests (concurrency)',
  'rate-ratio': 'a ratio of retries to requests (rate)',
  'gateway-windowed-pct': 'a share of requests over a window (rate)',
}

export const RB206: Rule = {
  id: 'RB206',
  title: 'Retry budgets in incompatible units',
  severity: 'caution',
  detects: 'Two budgets on one path, one capping concurrency and the other capping rate.',
  falsePositives:
    'None as a statement of fact. Whether the mismatch matters depends on latency, which is what the budget translator is for.',
  citations: ['gep-3388-not-equivalent', 'envoy-retry-budget', 'linkerd-retry-budget'],
  run(a) {
    const withBudget = a.facts.filter((f) => f.budget)
    for (let i = 0; i < withBudget.length; i++) {
      for (let j = i + 1; j < withBudget.length; j++) {
        const x = withBudget[i]!
        const y = withBudget[j]!
        if (unitsAgree(x.budget!, y.budget!)) continue
        return [
          finding(this, {
            hops: [x, y],
            consequence:
              'The same-looking “20%” bounds different quantities. A concurrency cap permits an unlimited retry rate as long as retries finish quickly; a rate cap permits unlimited concurrency as long as they arrive slowly.',
            detail: `${x.hop.name} caps retries as ${UNIT_NAME[x.budget!.kind]}; ${y.hop.name} caps them as ${UNIT_NAME[y.budget!.kind]}. No vendor publishes a conversion between the two.`,
            audit: [
              { label: x.hop.name, value: UNIT_NAME[x.budget!.kind] },
              { label: y.hop.name, value: UNIT_NAME[y.budget!.kind] },
            ],
          }),
        ]
      }
    }
    return []
  },
}

export const AMPLIFICATION_RULES: readonly Rule[] = [RB201, RB202, RB203, RB204, RB205, RB206]
