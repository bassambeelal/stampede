import { ChevronDown, ShieldCheck, Wand2 } from 'lucide-react'
import { useState } from 'react'
import type { Analysis } from '../domain/analyze'
import type { CitationId, Finding } from '../domain/model'
import { citation } from '../domain/registry/citations'
import { ruleById } from '../domain/rules'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Panel, PanelHeader } from '../ui/Panel'
import { CitationBlock, CiteRef } from './Citation'
import { SEVERITY_LABEL, SEVERITY_TONE, TONE_BG, TONE_TEXT } from './severity'
import { SeverityIcon } from './SeverityIcon'

export function Findings({
  analysis: a,
  onHighlight,
  onApply,
  actions,
}: {
  analysis: Analysis
  onHighlight: (hopIds: readonly string[]) => void
  onApply: (f: Finding) => void
  actions?: React.ReactNode
}) {
  const fails = a.findings.filter((f) => f.verdict === 'fail')
  const context = a.findings.filter((f) => f.verdict === 'needs-context')
  const names = new Map(a.facts.map((f) => [f.hop.id, f.hop.name]))

  return (
    <Panel flush>
      <PanelHeader
        title="Findings"
        hint="Every rule cites the vendor line it rests on. Open a finding to see the arithmetic."
        actions={actions}
      />
      {fails.length === 0 && context.length === 0 ? (
        <div className="flex items-center gap-3 px-5 py-8 text-sm text-ink-dim">
          <ShieldCheck size={20} className="text-safe" aria-hidden />
          No rule fires on this path for this failure. Try another failure above — layers disagree about what they retry.
        </div>
      ) : null}

      {fails.length > 0 ? (
        <ul className="divide-y divide-line" onPointerLeave={() => onHighlight([])}>
          {fails.map((f, i) => (
            <FindingCard
              key={`${f.ruleId}-${f.hopIds.join('-')}-${i}`}
              finding={f}
              names={names}
              onHighlight={onHighlight}
              onApply={onApply}
            />
          ))}
        </ul>
      ) : null}

      {context.length > 0 ? (
        <section className="border-t border-line bg-canvas/35">
          <h3 className="px-5 pt-4 pb-1 text-xs font-medium tracking-wide text-ink-faint uppercase">
            Needs context · {context.length}
          </h3>
          <ul className="divide-y divide-line/60" onPointerLeave={() => onHighlight([])}>
            {context.map((f, i) => (
              <FindingCard
                key={`${f.ruleId}-ctx-${i}`}
                finding={f}
                names={names}
                onHighlight={onHighlight}
                onApply={onApply}
              />
            ))}
          </ul>
        </section>
      ) : null}
    </Panel>
  )
}

/** The first citation from each product, so the summary line never reads “Envoy, Envoy”. */
function onePerProduct(ids: readonly CitationId[]): CitationId[] {
  const seen = new Set<string>()
  return ids.filter((id) => {
    const p = citation(id).product
    if (seen.has(p)) return false
    seen.add(p)
    return true
  })
}

function FindingCard({
  finding: f,
  names,
  onHighlight,
  onApply,
}: {
  finding: Finding
  names: ReadonlyMap<string, string>
  onHighlight: (hopIds: readonly string[]) => void
  onApply: (f: Finding) => void
}) {
  const [open, setOpen] = useState(false)
  const needs = f.verdict === 'needs-context'
  const tone = needs ? 'neutral' : SEVERITY_TONE[f.severity]
  const rule = ruleById(f.ruleId)
  const bodyId = `finding-${f.ruleId}-${f.hopIds.join('-')}`

  return (
    <li
      className="group relative"
      onPointerEnter={() => onHighlight(f.hopIds)}
      onFocus={() => onHighlight(f.hopIds)}
    >
      <span
        aria-hidden
        className={cx('absolute inset-y-0 left-0 w-[3px]', needs ? 'bg-line-strong' : TONE_BG[tone])}
      />
      <div className="px-5 py-4 pl-6">
        <div className="flex items-start gap-3">
          <SeverityIcon
            severity={f.severity}
            verdict={f.verdict}
            size={18}
            className={cx('mt-0.5 shrink-0', needs ? 'text-ink-faint' : TONE_TEXT[tone])}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <code className="rounded-xs bg-raised px-1.5 py-px text-micro font-medium text-ink-dim">
                {f.ruleId}
              </code>
              <h3 className="text-[0.9375rem] font-semibold text-ink">{f.title}</h3>
              {!needs ? (
                <Badge tone={tone} className="ml-auto">
                  {SEVERITY_LABEL[f.severity]}
                </Badge>
              ) : null}
            </div>
            {f.hopIds.length > 0 && f.hopIds.length <= 4 ? (
              <p className="mt-1 flex flex-wrap gap-1.5">
                {f.hopIds.map((id) => (
                  <span key={id} className="rounded-sm border border-line px-1.5 text-xs text-ink-dim">
                    {names.get(id) ?? id}
                  </span>
                ))}
              </p>
            ) : null}
            <p className="mt-2 text-sm leading-relaxed text-ink">{f.detail}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-dim">{f.consequence}</p>

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              <button
                type="button"
                aria-expanded={open}
                aria-controls={bodyId}
                onClick={() => setOpen((o) => !o)}
                className="inline-flex items-center gap-1 rounded-sm text-xs font-medium text-ink-dim hover:text-ink"
              >
                <ChevronDown
                  size={14}
                  aria-hidden
                  className={cx('transition-transform duration-200', open && 'rotate-180')}
                />
                {open ? 'Hide' : 'Show'} workings and sources
              </button>
              {f.remedy?.kind === 'set-field' ? (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Wand2 size={13} aria-hidden />}
                  onClick={() => onApply(f)}
                  title={`Set ${f.remedy.field} to ${f.remedy.toValue}`}
                >
                  Try the fix
                </Button>
              ) : null}
              {!open && f.citations.length > 0 ? (
                <span className="flex flex-wrap items-center gap-x-2 text-xs text-ink-faint">
                  per
                  {onePerProduct(f.citations).map((id) => (
                    <CiteRef key={id} id={id} />
                  ))}
                </span>
              ) : null}
            </div>

            {open ? (
              <div id={bodyId} className="mt-4 grid gap-4 motion-safe:animate-[rise_200ms_var(--ease-out-quint)]">
                {f.audit.length > 0 ? (
                  <section>
                    <h4 className="mb-1.5 text-xs font-medium text-ink-faint">Workings</h4>
                    <table className="w-full text-sm">
                      <tbody>
                        {f.audit.map((line, k) => (
                          <tr key={k} className="seam-b last:shadow-none">
                            <th scope="row" className="py-1.5 pr-4 text-left align-top font-normal text-ink-dim">
                              {line.label}
                            </th>
                            <td className="py-1.5 text-right align-top font-medium text-ink" data-numeric>
                              {line.value}
                              {line.workings ? (
                                <span className="mt-0.5 block font-mono text-micro font-normal text-ink-faint">
                                  {line.workings}
                                </span>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                ) : null}

                {f.remedy ? (
                  <section>
                    <h4 className="mb-1.5 text-xs font-medium text-ink-faint">Fix</h4>
                    {f.remedy.kind === 'set-field' ? (
                      <p className="text-sm text-ink">
                        Set{' '}
                        <code className="rounded-xs bg-raised px-1 py-px text-[0.8125rem]">
                          {names.get(f.remedy.hopId)} · {f.remedy.field}
                        </code>{' '}
                        to <strong className="font-semibold">{f.remedy.toValue}</strong>
                        <span className="text-ink-faint"> — per {citation(f.remedy.citationId).product}.</span>
                      </p>
                    ) : (
                      <p className="text-sm text-ink">
                        {f.remedy.constraint}
                        <span className="mt-1 block text-xs text-ink-faint">
                          No vendor publishes a default for this, so none is suggested.
                        </span>
                      </p>
                    )}
                  </section>
                ) : null}

                {f.citations.length > 0 ? (
                  <section className="grid gap-2">
                    <h4 className="text-xs font-medium text-ink-faint">Sources</h4>
                    {f.citations.map((id) => (
                      <CitationBlock key={id} id={id} />
                    ))}
                  </section>
                ) : null}

                {rule ? (
                  <p className="text-xs leading-relaxed text-ink-faint">
                    <span className="font-medium text-ink-dim">When this rule is wrong: </span>
                    {rule.falsePositives}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  )
}
