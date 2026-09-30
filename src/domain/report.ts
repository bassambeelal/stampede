import type { Analysis } from './analyze'
import { fmtMs, fmtX } from './format'
import type { Finding, Remedy } from './model'
import { citation } from './registry/citations'
import { failureClass } from './registry/failureClasses'

/**
 * A plain-text report for pasting into a PR comment, an incident channel or a
 * postmortem. Markdown-compatible but readable as plain text, since half the
 * places it gets pasted do not render Markdown.
 *
 * Deterministic: the same analysis yields the same text.
 */
export function buildReport(a: Analysis, permalink?: string): string {
  const lines: string[] = []
  const cls = failureClass(a.chain.failureClass)
  const path = a.facts.map((f) => f.hop.name).join(' → ') || '(empty)'
  const factors = a.facts.map((f) => f.amplifyingTries).join(' x ')

  lines.push('## Stampede — retry and timeout lint')
  lines.push('')
  lines.push(`Path: ${path}`)
  lines.push(`Failure analysed: ${cls.label}`)
  lines.push(
    `Worst-case amplification: ${a.qualifier === 'at-least' ? 'at least ' : ''}${fmtX(a.amplification)}${a.facts.length > 1 ? ` (${factors})` : ''} — an upper bound assuming every attempt fails and nothing sheds load`,
  )
  lines.push(`Worst-case wait for the user: ${fmtMs(a.userLatencyMs)}`)

  const fails = a.findings.filter((f) => f.verdict === 'fail')
  const context = a.findings.filter((f) => f.verdict === 'needs-context')

  if (fails.length) {
    lines.push('')
    lines.push(`### ${fails.length} ${fails.length === 1 ? 'finding' : 'findings'}`)
    for (const f of fails) lines.push('', ...findingLines(f))
  }
  if (context.length) {
    lines.push('')
    lines.push('### Needs context')
    for (const f of context) lines.push('', ...findingLines(f))
  }
  if (!fails.length && !context.length) {
    lines.push('', 'No findings.')
  }

  lines.push('')
  if (permalink) lines.push(`Open this analysis: ${permalink}`)
  lines.push('Defaults and quotes were read from vendor documentation; check them against the versions you run.')
  return lines.join('\n')
}

function findingLines(f: Finding): string[] {
  const out = [`- [${f.ruleId}] ${f.severity.toUpperCase()} — ${f.title}`, `  ${f.detail}`, `  Why it matters: ${f.consequence}`]
  if (f.remedy) out.push(`  Fix: ${remedyText(f.remedy)}`)
  for (const id of f.citations) {
    const c = citation(id)
    out.push(`  Source: ${c.product}, ${c.title} — ${c.url}`)
  }
  return out
}

export function remedyText(r: Remedy): string {
  return r.kind === 'set-field'
    ? `set ${r.field} to ${r.toValue} (per ${citation(r.citationId).product})`
    : `${r.constraint} (no vendor publishes a default for this)`
}
