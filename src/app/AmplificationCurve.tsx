import { useMemo, useState } from 'react'
import type { Analysis } from '../domain/analyze'
import { fmtPct, fmtX } from '../domain/format'
import { cumulativeExpected, expectedAmplification } from '../domain/math/amplification'
import { useElementWidth } from '../lib/useElementWidth'
import { Panel, PanelHeader } from '../ui/Panel'

const H = 260
const M = { top: 20, right: 18, bottom: 34, left: 46 }
const HEALTHY_P = 0.01

/**
 * Expected load against per-attempt failure rate. Almost flat across every
 * rate a healthy service sees, then turning up hard: which is why a config
 * that produces a storm passes review and looks fine on every dashboard until
 * the day it matters.
 */
export function AmplificationCurve({ analysis: a }: { analysis: Analysis }) {
  const [wrapRef, width] = useElementWidth<HTMLDivElement>()
  const [hoverP, setHoverP] = useState<number | null>(null)

  const tries = useMemo(() => a.facts.map((f) => f.amplifyingTries), [a.facts])
  const worst = a.amplification
  const flat = worst <= 1

  const innerW = Math.max(120, width - M.left - M.right)
  const innerH = H - M.top - M.bottom
  const x = (p: number) => M.left + p * innerW
  const y = (v: number) => M.top + innerH - ((v - 1) / Math.max(worst - 1, 1e-9)) * innerH

  const pts = a.curve.map((pt) => `${x(pt.p).toFixed(1)},${y(pt.amplification).toFixed(1)}`)
  const path = pts.length ? `M${pts.join('L')}` : ''

  const area = path ? `${path}L${x(1)},${y(1)}L${x(0)},${y(1)}Z` : ''
  const yTicks = niceTicks(1, worst, 4)
  const healthy = expectedAmplification(HEALTHY_P, tries)
  const declared = a.chain.errorRate.state === 'unknown' ? null : a.chain.errorRate.value

  const hover = hoverP === null ? null : {
    p: hoverP,
    amp: expectedAmplification(hoverP, tries),
    perHop: cumulativeExpected(hoverP, tries),
  }

  const move = (clientX: number, rect: DOMRect) => {
    const p = Math.min(1, Math.max(0, (clientX - rect.left - M.left) / innerW))
    setHoverP(p)
  }

  if (a.facts.length === 0) return null

  return (
    <Panel flush>
      <PanelHeader
        title="Why review never catches it"
        hint="Expected calls at the innermost hop as the per-attempt failure rate rises."
      />
      <div className="px-4 pt-3 pb-4 sm:px-5">
        <div ref={wrapRef} className="relative">
        {flat ? (
          <p className="py-10 text-center text-sm text-ink-dim">
            {a.facts.some((f) => f.effectiveTries > 1)
              ? 'The deadlines leave room for one attempt per hop, so load stays at 1× whatever the error rate.'
              : 'Nothing on this path retries this failure, so load stays at 1× whatever the error rate.'}
          </p>
        ) : (
          <>
            <svg
              width={width}
              height={H}
              className="block overflow-visible"
              role="img"
              aria-label={`At a 1% failure rate the path amplifies ${fmtX(healthy)}; as every attempt fails it rises to ${fmtX(worst)}.`}
            >
              {yTicks.map((t) => (
                <g key={t}>
                  <line x1={M.left} x2={M.left + innerW} y1={y(t)} y2={y(t)} className="stroke-line" strokeWidth={1} />
                  <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-faint text-[11px]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {fmtX(t)}
                  </text>
                </g>
              ))}
              {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                <text key={t} x={x(t)} y={H - 12} textAnchor="middle" className="fill-ink-faint text-[11px]">
                  {fmtPct(t, 0)}
                </text>
              ))}
              <text x={M.left + innerW} y={H - 12} dy="-1.35em" textAnchor="end" className="fill-ink-faint text-[10px]">
                attempts failing →
              </text>

              <path d={area} className="fill-accent-wash" />
              <line x1={M.left} x2={M.left + innerW} y1={y(worst)} y2={y(worst)} className="stroke-critical" strokeWidth={1.25} strokeDasharray="4 4" />
              <text x={M.left + 6} y={y(worst)} dy="-0.6em" className="fill-critical text-[11px] font-medium">
                worst case {fmtX(worst)}
              </text>
              <path d={path} fill="none" className="stroke-accent" strokeWidth={2.25} strokeLinejoin="round" />

              <Marker cx={x(HEALTHY_P)} cy={y(healthy)} label={`1% failing → ${fmtX(healthy)}`} tone="safe" />
              {declared !== null && declared > 0 && declared < 1 ? (
                <Marker
                  cx={x(declared)}
                  cy={y(expectedAmplification(declared, tries))}
                  label={`your ${fmtPct(declared)} → ${fmtX(expectedAmplification(declared, tries))}`}
                  tone="accent"
                  below
                />
              ) : null}

              {hover ? (
                <g pointerEvents="none">
                  <line x1={x(hover.p)} x2={x(hover.p)} y1={M.top} y2={M.top + innerH} className="stroke-ink-faint" strokeDasharray="2 3" />
                  <circle cx={x(hover.p)} cy={y(hover.amp)} r={4.5} className="fill-surface stroke-accent" strokeWidth={2} />
                </g>
              ) : null}

              <rect
                x={M.left}
                y={M.top}
                width={innerW}
                height={innerH}
                fill="transparent"
                tabIndex={0}
                aria-label="Explore the curve. Use the left and right arrow keys."
                className="cursor-crosshair outline-none focus-visible:stroke-accent"
                onPointerMove={(e) => move(e.clientX, e.currentTarget.ownerSVGElement!.getBoundingClientRect())}
                onPointerLeave={() => setHoverP(null)}
                onBlur={() => setHoverP(null)}
                onKeyDown={(e) => {
                  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
                  e.preventDefault()
                  const step = e.shiftKey ? 0.1 : 0.01
                  setHoverP((p) => Math.min(1, Math.max(0, (p ?? HEALTHY_P) + (e.key === 'ArrowRight' ? step : -step))))
                }}
              />
            </svg>

            {hover ? (
              <div
                className="pointer-events-none absolute top-2 z-10 w-56 rounded-md border border-line-strong bg-overlay px-3 py-2 text-xs shadow-e3"
                style={x(hover.p) > width / 2 ? { left: Math.max(0, x(hover.p) - 232) } : { left: x(hover.p) + 12 }}
              >
                <p className="font-medium text-ink" data-numeric>
                  {fmtPct(hover.p)} of attempts failing → {fmtX(hover.amp)}
                </p>
                <ul className="mt-1.5 grid gap-0.5 text-ink-dim" data-numeric>
                  {a.facts.map((f, i) => (
                    <li key={f.hop.id} className="flex justify-between gap-3">
                      <span className="truncate">{f.hop.name}</span>
                      <span>{hover.perHop[i]!.toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-ink-faint">
          Assumes each attempt fails independently. A brownout correlates failures — the retry of a timed-out call is
          likely to time out too — so real load climbs this curve faster than drawn. During an incident, read the worst
          case.
        </p>
      </div>
    </Panel>
  )
}

function Marker({
  cx,
  cy,
  label,
  tone,
  below = false,
}: {
  cx: number
  cy: number
  label: string
  tone: 'safe' | 'accent'
  below?: boolean
}) {
  const fill = tone === 'safe' ? 'fill-safe' : 'fill-accent'
  return (
    <g>
      <circle cx={cx} cy={cy} r={4} className={fill} />
      <text x={cx + 8} y={cy} dy={below ? '1.3em' : '-0.7em'} className={`${fill} text-[11px] font-medium`}>
        {label}
      </text>
    </g>
  )
}

/** Up to `count` round-number ticks spanning [lo, hi], always including lo. */
function niceTicks(lo: number, hi: number, count: number): number[] {
  if (hi <= lo) return [lo]
  const raw = (hi - lo) / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const ticks = [lo]
  for (let v = Math.ceil(lo / step) * step; v < hi - step * 0.35; v += step) if (v > lo) ticks.push(v)
  return ticks
}
