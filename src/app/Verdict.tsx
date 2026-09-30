import type { Analysis } from '../domain/analyze'
import { fmtMs, fmtXNumber } from '../domain/format'
import type { FailureClassId, Severity } from '../domain/model'
import { FAILURE_CLASSES, failureClass } from '../domain/registry/failureClasses'
import { cx } from '../ui/cx'
import {
  amplificationTone,
  SEVERITY_LABEL,
  SEVERITY_TONE,
  TONE_TEXT,
} from './severity'
import { SeverityIcon } from './SeverityIcon'

const SEVERITIES: readonly Severity[] = ['critical', 'danger', 'caution']

/**
 * The verdict strip. It answers, in order: what failure are we asking about,
 * how many calls does one bad request turn into, and what did we find.
 */
export function Verdict({
  analysis,
  onFailureClass,
}: {
  analysis: Analysis
  onFailureClass: (id: FailureClassId) => void
}) {
  const a = analysis
  const cls = failureClass(a.chain.failureClass)
  const innermost = a.facts[a.facts.length - 1]
  const configured = a.facts.filter((f) => f.totalTries > 1)
  const inherited = configured.filter((f) => f.hop.totalTries.state === 'inherited')
  const multiplying = a.facts.filter((f) => f.amplifyingTries > 1)
  const truncated = a.facts.filter((f) => f.amplifyingTries < f.effectiveTries)
  const fails = a.findings.filter((f) => f.verdict === 'fail')
  const context = a.findings.filter((f) => f.verdict === 'needs-context').length
  const tone = amplificationTone(a.amplification)
  const empty = a.facts.length === 0

  return (
    <section
      aria-labelledby="verdict-heading"
      className="lip relative overflow-hidden rounded-xl border border-line bg-surface shadow-e2"
    >
      <div className="border-b border-line px-5 py-4 sm:px-6">
        <FailurePicker value={a.chain.failureClass} onChange={onFailureClass} />
        <p className="mt-2.5 text-sm text-ink-dim">{cls.note}</p>
      </div>

      <div className="grid gap-6 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,19rem)] lg:gap-10">
        <div className="min-w-0">
          <h1 id="verdict-heading" className="sr-only">
            Worst-case amplification
          </h1>
          {empty ? (
            <p className="text-lg text-ink-dim">
              Add the layers in your request path to see how a failure multiplies through them.
            </p>
          ) : (
            <>
              <p className="text-xs font-medium tracking-wide text-ink-faint uppercase">
                One failed request becomes
              </p>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
                {a.qualifier === 'at-least' ? (
                  <span className="text-2xl font-medium text-ink-dim">at least</span>
                ) : null}
                <span
                  data-numeric
                  className={cx(
                    'text-[4.5rem] leading-none font-semibold tracking-[-0.045em] sm:text-[5.5rem]',
                    TONE_TEXT[tone],
                  )}
                >
                  {fmtXNumber(a.amplification)}
                  <span className="ml-0.5 text-[0.55em] font-medium tracking-normal">×</span>
                </span>
                <span className="text-lg text-ink-dim">
                  calls made by the innermost hop,{' '}
                  <span className="font-medium text-ink">{innermost?.hop.name}</span>
                </span>
              </div>
              <Factorization analysis={a} />
              {truncated.length ? (
                <p className="mt-3 max-w-prose rounded-md border border-caution-edge bg-caution-wash px-3 py-2 text-sm text-ink">
                  {truncated.length === 1 ? `${truncated[0]!.hop.name}’s deadline leaves` : 'The deadlines leave'} room for
                  fewer attempts than configured when attempts time out, so some of the retries in this config never
                  run for this failure. The deadline panel shows which.
                </p>
              ) : null}
              <p className="mt-3 max-w-prose text-xs leading-relaxed text-ink-faint">
                An upper bound: every attempt fails and nothing — no budget, breaker or load shedder —
                intervenes. {a.qualifier === 'at-least'
                  ? 'Some hops have unknown try counts and were counted as one call, so the true figure can only be higher.'
                  : ''}
              </p>
            </>
          )}
        </div>

        <dl className="grid content-start gap-3.5 border-line lg:border-l lg:pl-8">
          <Stat
            label="Retry layers on this path"
            value={
              configured.length === 0
                ? 'None'
                : `${configured.length}${inherited.length ? ` · ${inherited.length} never configured` : ''}`
            }
            note={
              configured.length && multiplying.length < configured.length
                ? `${multiplying.length === 0 ? 'None' : multiplying.length} multipl${multiplying.length === 1 ? 'ies' : 'y'} “${cls.label}”`
                : undefined
            }
            emphasis={inherited.length > 0}
          />
          <Stat label="Longest the user can wait" value={fmtMs(a.userLatencyMs)} />
          <div>
            <dt className="text-xs text-ink-faint">Findings</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              {fails.length === 0 && context === 0 ? (
                <span className="text-safe">Nothing to report</span>
              ) : null}
              {SEVERITIES.map((s) => {
                const n = fails.filter((f) => f.severity === s).length
                if (!n) return null
                return (
                  <span key={s} className={cx('inline-flex items-center gap-1 font-medium', TONE_TEXT[SEVERITY_TONE[s]])}>
                    <SeverityIcon severity={s} size={14} />
                    {n} {SEVERITY_LABEL[s].toLowerCase()}
                  </span>
                )
              })}
              {context ? (
                <span className="inline-flex items-center gap-1 text-ink-dim">
                  <SeverityIcon severity="info" verdict="needs-context" size={14} />
                  {context} need context
                </span>
              ) : null}
            </dd>
          </div>
        </dl>
      </div>
    </section>
  )
}

function Stat({
  label,
  value,
  note,
  emphasis,
}: {
  label: string
  value: string
  note?: string
  emphasis?: boolean
}) {
  return (
    <div>
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd data-numeric className={cx('mt-0.5 text-base font-medium', emphasis ? 'text-accent' : 'text-ink')}>
        {value}
        {note ? <span className="mt-0.5 block text-xs font-normal text-ink-dim">{note}</span> : null}
      </dd>
    </div>
  )
}

/** "3 × 3 × 1 × 3", with pass-through hops muted, so the product is legible. */
function Factorization({ analysis: a }: { analysis: Analysis }) {
  if (a.facts.length < 2) return null
  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 font-mono text-sm" aria-label="Calls per hop, multiplied">
      {a.facts.map((f, i) => (
        <span key={f.hop.id} className="inline-flex items-center gap-1.5">
          {i > 0 ? <span className="text-ink-faint">×</span> : null}
          <span
            title={`${f.hop.name}: ${f.amplifyingTries} ${f.amplifyingTries === 1 ? 'call' : 'calls'}`}
            className={cx(
              'rounded-sm border px-1.5 py-0.5',
              f.amplifyingTries > 1 ? 'border-line bg-raised text-ink' : 'border-transparent text-ink-faint',
              !f.triesKnown && 'border border-dashed border-caution-edge text-caution',
            )}
          >
            {f.triesKnown ? f.amplifyingTries : '?'}
          </span>
        </span>
      ))}
    </p>
  )
}

function FailurePicker({
  value,
  onChange,
}: {
  value: FailureClassId
  onChange: (id: FailureClassId) => void
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-medium tracking-wide text-ink-faint uppercase">
        When this fails
      </legend>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Failure to analyse">
        {FAILURE_CLASSES.map((c) => {
          const selected = c.id === value
          return (
            <label
              key={c.id}
              className={cx(
                'relative inline-flex h-8 cursor-pointer items-center rounded-full border px-3 text-sm font-medium',
                'transition-[background-color,border-color,color] duration-150',
                'has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-accent',
                selected
                  ? 'border-accent-edge bg-accent-wash text-accent'
                  : 'border-line text-ink-dim hover:border-line-strong hover:text-ink',
              )}
            >
              <input
                type="radio"
                name="failure-class"
                value={c.id}
                checked={selected}
                onChange={() => onChange(c.id)}
                className="absolute inset-0 cursor-pointer appearance-none rounded-full"
                data-focus-ring="custom"
              />
              <span className="pointer-events-none">{c.label}</span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
