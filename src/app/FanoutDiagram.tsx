import { ArrowRight, User } from 'lucide-react'
import type { Analysis, HopFacts } from '../domain/analyze'
import { failureClass } from '../domain/registry/failureClasses'
import { cx } from '../ui/cx'
import { Panel, PanelHeader } from '../ui/Panel'
import { ProvenanceMark } from './Citation'

/** Dots drawn per column before the rest collapses into "+N more". */
const DOT_CAP = 144
const COLS = 12

/**
 * The fan-out, drawn literally: every dot is one call, and a dot is warm when
 * the call is a retry rather than a first attempt. The point is that the
 * multiplication is *seen* rather than asserted — the reader can count it.
 */
export function FanoutDiagram({
  analysis: a,
  highlight,
}: {
  analysis: Analysis
  highlight: ReadonlySet<string>
}) {
  const cls = failureClass(a.chain.failureClass)
  if (a.facts.length === 0) return null

  return (
    <Panel flush>
      <PanelHeader
        title="How one failed request fans out"
        hint={`Each dot is one call when every attempt fails with “${cls.label}”.`}
        actions={<Legend />}
      />
      <div className="overflow-x-auto">
        <ol
          className="flex w-full min-w-max items-stretch px-4 py-5 sm:px-5"
          aria-label={`Calls per hop: ${a.facts.map((f, i) => `${f.hop.name} makes ${a.cumulative[i]}`).join(', ')}`}
        >
          <li className="flex w-20 shrink-0 flex-col items-center justify-center gap-2 text-center">
            <span className="grid size-9 place-items-center rounded-full border border-line bg-raised text-ink-dim">
              <User size={16} aria-hidden />
            </span>
            <span className="text-xs text-ink-faint">1 request</span>
          </li>
          {a.facts.map((f, i) => (
            <Column
              key={f.hop.id}
              facts={f}
              incoming={i === 0 ? 1 : a.cumulative[i - 1]!}
              outgoing={a.cumulative[i]!}
              highlighted={highlight.has(f.hop.id)}
              dimmed={highlight.size > 0 && !highlight.has(f.hop.id)}
            />
          ))}
        </ol>
      </div>
    </Panel>
  )
}

function Column({
  facts: f,
  incoming,
  outgoing,
  highlighted,
  dimmed,
}: {
  facts: HopFacts
  incoming: number
  outgoing: number
  highlighted: boolean
  dimmed: boolean
}) {
  const passThrough = f.amplifyingTries <= 1
  const shown = Math.min(outgoing, DOT_CAP)
  const retries = outgoing - incoming
  const truncatedByDeadline = f.amplifyingTries < f.effectiveTries

  return (
    <li className="flex min-w-0 flex-1 items-stretch">
      <div className="flex w-12 shrink-0 flex-col items-center justify-center gap-1" aria-hidden>
        <span
          className={cx(
            'rounded-sm px-1.5 py-0.5 font-mono text-xs font-medium',
            passThrough ? 'text-ink-faint' : 'bg-danger-wash text-danger',
            !f.triesKnown && 'border border-dashed border-caution-edge bg-transparent text-caution',
          )}
        >
          ×{f.triesKnown ? f.amplifyingTries : '?'}
        </span>
        <ArrowRight size={14} className="text-line-strong" />
      </div>

      <div
        className={cx(
          'flex min-w-[8.5rem] max-w-[15rem] flex-1 flex-col rounded-lg border px-3 pt-3 pb-2.5 transition-[opacity,border-color,box-shadow] duration-200',
          highlighted ? 'border-accent-edge shadow-glow' : 'border-line',
          dimmed && 'opacity-45',
          passThrough ? 'bg-canvas/40' : 'bg-raised/60',
          !f.triesKnown && 'border-dashed border-caution-edge',
        )}
      >
        <div
          className="grid content-start gap-[3px]"
          style={{ gridTemplateColumns: `repeat(${COLS}, 7px)` }}
        >
          {Array.from({ length: shown }, (_, k) => (
            <span
              key={k}
              className={cx(
                'size-[7px] rounded-full motion-safe:animate-[fade_260ms_var(--ease-out-quint)_both]',
                k < incoming ? 'bg-ink-faint' : 'bg-danger',
              )}
              style={{ animationDelay: `${Math.min(k * 4, 360)}ms` }}
            />
          ))}
        </div>
        {outgoing > DOT_CAP ? (
          <p className="mt-1.5 text-micro text-ink-faint">+{outgoing - DOT_CAP} more</p>
        ) : null}

        <div className="mt-auto pt-3">
          <p className="text-2xl leading-none font-semibold tracking-tight" data-numeric>
            {outgoing.toLocaleString()}
          </p>
          <p className="mt-0.5 text-micro text-ink-faint">
            {outgoing === 1 ? 'call' : 'calls'}
            {retries > 0 ? ` · ${retries.toLocaleString()} retries` : ''}
          </p>
          <p className="mt-2 flex items-center gap-1.5 truncate text-xs font-medium text-ink" title={f.hop.name}>
            <ProvenanceMark state={f.hop.totalTries.state} />
            <span className="truncate">{f.hop.name}</span>
          </p>
          <p className="mt-0.5 truncate text-micro text-ink-faint">
            {truncatedByDeadline
              ? `${f.amplifyingTries} of ${f.effectiveTries} fit the deadline`
              : passThrough
                ? f.totalTries > 1
                  ? 'doesn’t retry this'
                  : 'no retries'
                : (f.layer?.product ?? 'custom')}
          </p>
        </div>
      </div>
    </li>
  )
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-xs text-ink-faint" aria-hidden>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-1.5 rounded-full bg-ink-faint" /> first attempt
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-1.5 rounded-full bg-danger" /> retry
      </span>
    </div>
  )
}
