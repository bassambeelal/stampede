import type { AnalysisInput } from '../analyze'
import { fmtX, listNames, plural } from '../format'
import type { AuditLine, Finding, Severity, Verdict } from '../model'
import { AMPLIFICATION_RULES } from './amplification'
import { RETRYABILITY_RULES } from './retryability'
import { TIMEOUT_RULES } from './timeouts'
import { finding, type Rule } from './types'

export type { Rule } from './types'

/**
 * RB001 — the honesty rule. Whenever the answer rests on something the user
 * marked unknown, say exactly what was assumed and in which direction it pushes
 * the numbers. This is what turns "81x" into "at least 81x".
 */
export const RB001: Rule = {
  id: 'RB001',
  title: 'Some numbers rest on unknowns',
  severity: 'info',
  detects: 'Hops with fields marked unknown that feed the amplification or deadline figures.',
  falsePositives: 'None. Fill the fields in to clear it.',
  citations: [],
  run(a) {
    const noTries = a.facts.filter((f) => !f.triesKnown)
    const assumedRetry = a.facts.filter((f) => f.retryOnAssumed)
    const noBackoff = a.facts.filter((f) => f.totalTries > 1 && !f.backoffKnown)
    if (!noTries.length && !assumedRetry.length && !noBackoff.length) return []

    const parts: string[] = []
    const audit: AuditLine[] = []
    if (noTries.length) {
      parts.push(
        `${listNames(noTries.map((f) => f.hop.name))} ${noTries.length === 1 ? 'has' : 'have'} an unknown number of tries and ${noTries.length === 1 ? 'was' : 'were'} counted as a single call, so ${fmtX(a.amplification)} is a lower bound.`,
      )
      noTries.forEach((f) => audit.push({ label: f.hop.name, value: 'tries unknown — counted as 1' }))
    }
    if (assumedRetry.length) {
      parts.push(
        `${listNames(assumedRetry.map((f) => f.hop.name))} ${assumedRetry.length === 1 ? 'is' : 'are'} assumed to retry this failure because the retry conditions are unknown.`,
      )
      assumedRetry.forEach((f) =>
        audit.push({ label: f.hop.name, value: 'retry conditions unknown — assumed to retry' }),
      )
    }
    if (noBackoff.length) {
      parts.push(
        `${plural(noBackoff.length, 'retrying hop has', 'retrying hops have')} unknown backoff, treated as no wait — which admits the most attempts inside each deadline.`,
      )
      noBackoff.forEach((f) =>
        audit.push({ label: f.hop.name, value: 'backoff unknown — treated as zero' }),
      )
    }

    return [
      finding(this, {
        verdict: 'needs-context',
        hops: [...new Set([...noTries, ...assumedRetry, ...noBackoff])],
        consequence:
          'Every assumption is made in the direction that cannot understate amplification. Unknown try counts are the exception — they can only be counted as one call, which is why the headline says “at least”.',
        detail: parts.join(' '),
        audit,
      }),
    ]
  },
}

export const RULES: readonly Rule[] = [
  RB001,
  ...TIMEOUT_RULES,
  ...AMPLIFICATION_RULES,
  ...RETRYABILITY_RULES,
]

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, danger: 1, caution: 2, info: 3 }
const VERDICT_ORDER: Record<Verdict, number> = { fail: 0, 'needs-context': 1, pass: 2 }

/** Runs every rule and orders the findings worst-first, stably by rule id. */
export function runRules(a: AnalysisInput): Finding[] {
  const all = RULES.flatMap((r) => r.run(a))
  return all
    .map((f, i) => ({ f, i }))
    .sort(
      (x, y) =>
        VERDICT_ORDER[x.f.verdict] - VERDICT_ORDER[y.f.verdict] ||
        SEVERITY_ORDER[x.f.severity] - SEVERITY_ORDER[y.f.severity] ||
        x.i - y.i,
    )
    .map(({ f }) => f)
}

export function ruleById(id: string): Rule | undefined {
  return RULES.find((r) => r.id === id)
}
