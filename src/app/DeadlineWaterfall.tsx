import { Hourglass } from 'lucide-react'
import type { Analysis, HopFacts } from '../domain/analyze'
import { fmtMs } from '../domain/format'
import { waterfallBars } from '../domain/math/deadline'
import { cx } from '../ui/cx'
import { Panel, PanelHeader } from '../ui/Panel'

/**
 * One row per hop: attempts and backoff gaps on a timeline, with the time the
 * hop actually has drawn as a cut. Attempts past the cut are drawn as ghosts —
 * they are in the config, and they will never run.
 */
export function DeadlineWaterfall({
  analysis: a,
  highlight,
}: {
  analysis: Analysis
  highlight: ReadonlySet<string>
}) {
  if (a.facts.length === 0) return null
  const nothingBounded = !Number.isFinite(a.userLatencyMs) && a.facts.every(
    (f) => !Number.isFinite(f.deadline.availableMs) && !Number.isFinite(f.deadline.attemptBoundMs),
  )
  return (
    <Panel flush>
      <PanelHeader
        title="Attempts your deadlines allow"
        hint="Worst case from configured timeouts: each attempt runs until its timeout fires. Bounds, not measurements."
      />
      {nothingBounded ? (
        <div className="flex items-start gap-3 px-5 py-6">
          <Hourglass size={20} className="mt-0.5 shrink-0 text-caution" aria-hidden />
          <div className="max-w-prose text-sm leading-relaxed">
            <p className="font-medium text-ink">No hop on this path has a deadline, so there is nothing to draw.</p>
            <p className="mt-1 text-ink-dim">
              A dependency that hangs without closing the connection is waited on forever, by every hop at once
              {a.facts.some((f) => f.layer?.id === 'istio-sidecar') ? ' — Istio disables its route timeout by default' : ''}.
              Set a timeout on any hop to see which of its configured attempts actually fit.
            </p>
          </div>
        </div>
      ) : (
      <ol className="divide-y divide-line">
        {a.facts.map((f) => (
          <Row
            key={f.hop.id}
            f={f}
            highlighted={highlight.has(f.hop.id)}
            dimmed={highlight.size > 0 && !highlight.has(f.hop.id)}
          />
        ))}
      </ol>
      )}
    </Panel>
  )
}

function Row({ f, highlighted, dimmed }: { f: HopFacts; highlighted: boolean; dimmed: boolean }) {
  const d = f.deadline
  const bounded = Number.isFinite(d.availableMs) || Number.isFinite(d.attemptBoundMs)
  const bars = bounded ? waterfallBars(d) : []
  const end = bars.length ? bars[bars.length - 1]!.endMs : 0
  const span = Math.max(end, Number.isFinite(d.availableMs) ? d.availableMs : 0) || 1
  const pct = (ms: number) => `${(ms / span) * 100}%`
  const lost = d.configuredTries - d.reachableTries

  return (
    <li
      className={cx(
        'px-5 py-3.5 transition-opacity duration-200',
        dimmed && 'opacity-45',
        highlighted && 'bg-accent-wash',
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
        <p className="text-sm font-medium text-ink">{f.hop.name}</p>
        <p className="text-xs text-ink-faint" data-numeric>
          {d.configuredTries > 1 ? (
            <>
              <span className={cx('font-medium', lost > 0 ? 'text-danger' : 'text-ink-dim')}>
                {d.reachableTries} of {d.configuredTries}
              </span>{' '}
              attempts fit
            </>
          ) : (
            'single attempt'
          )}
          {' · '}has {fmtMs(d.availableMs)}
        </p>
      </div>

      {!bounded ? (
        <p className="mt-2 rounded-md border border-dashed border-line px-3 py-2 text-xs text-ink-faint">
          Nothing bounds this hop — no timeout here and none inherited from its caller. Every attempt can wait forever.
        </p>
      ) : (
        <>
          <div className="relative mt-2.5 h-7" role="img" aria-label={`${d.reachableTries} of ${d.configuredTries} attempts fit inside ${fmtMs(d.availableMs)}`}>
            <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line" />
            {bars.map((b) =>
              b.kind === 'wait' ? (
                <span
                  key={`w${b.index}`}
                  className={cx(
                    'absolute top-1/2 h-0 -translate-y-1/2 border-t border-dashed',
                    b.reachable ? 'border-ink-faint' : 'border-line-strong',
                  )}
                  style={{ left: pct(b.startMs), width: pct(b.endMs - b.startMs) }}
                />
              ) : (
                <span
                  key={`a${b.index}`}
                  title={`Attempt ${b.index + 1}: ${fmtMs(b.startMs)}–${fmtMs(b.endMs)}${b.reachable ? '' : ' (never runs)'}`}
                  className={cx(
                    'absolute top-1 bottom-1 rounded-[3px] border',
                    b.reachable
                      ? 'border-accent-edge bg-accent-wash'
                      : 'border-dashed border-line-strong bg-[repeating-linear-gradient(135deg,transparent_0_4px,var(--color-line)_4px_5px)]',
                  )}
                  style={{ left: pct(b.startMs), width: `max(3px, calc(${pct(b.endMs - b.startMs)} - 2px))` }}
                >
                  <span
                    className={cx(
                      'absolute inset-0 grid place-items-center truncate px-1 text-micro font-medium',
                      b.reachable ? 'text-accent' : 'text-ink-faint line-through',
                    )}
                  >
                    {b.index + 1}
                  </span>
                </span>
              ),
            )}
            {Number.isFinite(d.availableMs) ? (
              <span
                className="absolute -top-0.5 -bottom-0.5 w-0 border-l-2 border-critical"
                style={{ left: pct(d.availableMs) }}
                aria-hidden
              />
            ) : null}
          </div>
          <div className="mt-1 flex justify-between text-micro text-ink-faint" data-numeric aria-hidden>
            <span>0</span>
            <span>
              {Number.isFinite(d.availableMs) ? (
                <span className="text-critical">deadline {fmtMs(d.availableMs)}</span>
              ) : null}
              {end > d.availableMs && Number.isFinite(d.availableMs) ? ` · config asks for ${fmtMs(end)}` : ''}
              {!Number.isFinite(d.availableMs) ? `${fmtMs(end)}` : ''}
            </span>
          </div>
          {d.noPerAttemptTimeout && d.configuredTries > 1 && Number.isFinite(d.availableMs) ? (
            <p className="mt-1.5 text-xs text-ink-dim">
              No per-attempt timeout here, so the first attempt can use the whole {fmtMs(d.availableMs)}.
            </p>
          ) : null}
        </>
      )}
    </li>
  )
}
