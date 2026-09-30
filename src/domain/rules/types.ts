import type { AnalysisInput, HopFacts } from '../analyze'
import type {
  AuditLine,
  CitationId,
  Finding,
  Remedy,
  Severity,
  Verdict,
} from '../model'

export interface Rule {
  readonly id: string
  readonly title: string
  readonly severity: Severity
  /** What the rule looks for, for the rule reference. */
  readonly detects: string
  /** When the rule fires wrongly, shown on the card so it can be judged. */
  readonly falsePositives: string
  readonly citations: readonly CitationId[]
  /** Returns one finding per problem; an empty array means the rule passed. */
  readonly run: (a: AnalysisInput) => readonly Finding[]
}

interface FindingInput {
  readonly verdict?: Verdict
  readonly severity?: Severity
  readonly title?: string
  readonly hops: readonly HopFacts[]
  readonly consequence: string
  readonly detail: string
  readonly audit: readonly AuditLine[]
  readonly citations?: readonly CitationId[]
  readonly remedy?: Remedy
}

/** Builds a finding, filling rule-level defaults. */
export function finding(rule: Rule, f: FindingInput): Finding {
  return {
    ruleId: rule.id,
    verdict: f.verdict ?? 'fail',
    severity: f.severity ?? rule.severity,
    title: f.title ?? rule.title,
    hopIds: f.hops.map((h) => h.hop.id),
    consequence: f.consequence,
    detail: f.detail,
    audit: f.audit,
    citations: f.citations ?? rule.citations,
    remedy: f.remedy,
  }
}

/** True when the hop's proxy is Envoy, whose per-try semantics are specific. */
export function isEnvoyBased(f: HopFacts): boolean {
  return f.layer?.id === 'istio-sidecar' || f.layer?.id === 'envoy-route'
}

export function sum(xs: readonly number[]): number {
  let s = 0
  for (const x of xs) s += x
  return s
}
