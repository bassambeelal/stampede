import { fmtMs, listNames, plural } from '../format'
import type { Finding } from '../model'
import { finding, type Rule } from './types'

/** RB3xx — how retries are spaced, and whether they are safe at all. */

/** Proxies whose retry goes to a different upstream instance by design. */
const NEXT_INSTANCE_LAYERS = new Set(['ingress-nginx', 'spring-lb'])

export const RB301: Rule = {
  id: 'RB301',
  title: 'Retries with no backoff',
  severity: 'danger',
  detects: 'A hop that retries with no wait at all between attempts.',
  falsePositives:
    'Proxies that retry against a different instance (ingress-nginx’s next-upstream, Spring’s next-instance retry) are excluded: their retry does not land on the instance that just failed.',
  citations: ['grpc-backoff', 'aws-jitter-why'],
  run(a) {
    const out: Finding[] = []
    for (const f of a.facts) {
      if (f.totalTries < 2 || !f.backoffKnown) continue
      if (f.layer && NEXT_INSTANCE_LAYERS.has(f.layer.id)) continue
      if (f.backoff.kind !== 'none' && f.backoff.baseMs > 0) continue
      out.push(
        finding(this, {
          hops: [f],
          consequence:
            'Every retry lands on the struggling dependency immediately, as a burst, from every client at once.',
          detail: `${f.hop.name} fires its ${plural(f.totalTries - 1, 'retry', 'retries')} back to back with no pause.`,
          audit: [{ label: 'Backoff', value: 'none' }],
          remedy: {
            kind: 'set-field',
            hopId: f.hop.id,
            field: 'backoff',
            toValue: 'exponential, 50ms base, full jitter, 20s cap (the AWS SDK’s own values)',
            citationId: 'aws-backoff-formula',
          },
        }),
      )
    }
    return out
  },
}

export const RB302: Rule = {
  id: 'RB302',
  title: 'Backoff without jitter',
  severity: 'caution',
  detects: 'A hop that waits between retries but waits the same amount as every other client.',
  falsePositives: 'Harmless with a single client. Rarely true of a service worth analysing.',
  citations: ['aws-jitter-why', 'aws-jitter-full'],
  run(a) {
    const out: Finding[] = []
    for (const f of a.facts) {
      if (f.totalTries < 2 || !f.backoffKnown) continue
      if (f.backoff.kind === 'none' || f.backoff.baseMs <= 0) continue
      if (f.backoff.jitter !== 'none') continue
      out.push(
        finding(this, {
          hops: [f],
          consequence:
            'Every client that failed together retries together. The retries arrive as synchronised waves, re-creating the spike that caused the failure.',
          detail: `${f.hop.name} waits ${f.backoff.kind === 'fixed' ? `a fixed ${fmtMs(f.backoff.baseMs)}` : `${fmtMs(f.backoff.baseMs)}, growing exponentially,`} with no randomisation.`,
          audit: [
            { label: 'Backoff', value: `${f.backoff.kind}, ${fmtMs(f.backoff.baseMs)} base` },
            { label: 'Jitter', value: 'none' },
          ],
          remedy: {
            kind: 'set-field',
            hopId: f.hop.id,
            field: 'backoff.jitter',
            toValue: 'full',
            citationId: 'aws-jitter-full',
          },
        }),
      )
    }
    return out
  },
}

export const RB303: Rule = {
  id: 'RB303',
  title: 'Retrying work that is not safe to repeat',
  severity: 'critical',
  detects: 'A hop that retries an operation marked as not idempotent.',
  falsePositives:
    'Safe if the operation carries an idempotency key the server deduplicates on. If so, mark the hop idempotent.',
  citations: ['msext-all-methods'],
  run(a) {
    const retrying = a.facts.filter((f) => f.effectiveTries > 1)
    const unsafe = retrying.filter((f) => f.idempotent === false)
    const unknown = retrying.filter((f) => f.idempotent === null)
    const out: Finding[] = unsafe.map((f) =>
      finding(this, {
        hops: [f],
        consequence:
          'A timed-out attempt may already have succeeded. Retrying it performs the work twice — a duplicate order, a double charge, a second row.',
        detail: `${f.hop.name} retries an operation that is not safe to repeat.${
          f.layer?.defaults.idempotent?.appliesWhen ? ` ${f.layer.defaults.idempotent.appliesWhen}` : ''
        }`,
        audit: [{ label: 'Safe to repeat', value: 'no' }],
        citations: f.hop.idempotent.state === 'inherited' ? [f.hop.idempotent.citationId] : this.citations,
        remedy: {
          kind: 'constraint',
          constraint:
            'Retry only operations that are safe to repeat, or make this one safe with an idempotency key the server deduplicates on.',
          noAuthoritativeDefault: true,
        },
      }),
    )
    if (unknown.length > 0) {
      out.push(
        finding(this, {
          verdict: 'needs-context',
          severity: 'info',
          title: 'Unknown whether retried work is safe to repeat',
          hops: unknown,
          consequence:
            'If any of these operations writes, a retry after a timeout can perform it twice.',
          detail: `${listNames(unknown.map((f) => f.hop.name))} ${unknown.length === 1 ? 'retries' : 'retry'}, and whether the work is idempotent is unknown.`,
          audit: unknown.map((f) => ({ label: f.hop.name, value: 'idempotency unknown' })),
        }),
      )
    }
    return out
  },
}

export const RETRYABILITY_RULES: readonly Rule[] = [RB301, RB302, RB303]
