import type { Analysis } from '../domain/analyze'
import { fmtPct } from '../domain/format'
import { translateBudget, type BudgetAllowance } from '../domain/math/budget'
import { declared, unknown, type CitationId, type FieldValue, type RetryBudget } from '../domain/model'
import { cx } from '../ui/cx'
import { inputBase } from '../ui/input'
import { Panel, PanelHeader } from '../ui/Panel'
import { CiteRef } from './Citation'

interface Row {
  key: string
  label: string
  budget: RetryBudget
  cite?: CitationId
  mine: boolean
}

const REFERENCE: Row[] = [
  { key: 'envoy', label: 'Envoy default', budget: { kind: 'envoy-concurrency-pct', value: 20, floor: 3 }, cite: 'envoy-retry-budget', mine: false },
  { key: 'linkerd', label: 'Linkerd default', budget: { kind: 'rate-ratio', value: 0.2, floor: 10, windowSec: 10 }, cite: 'linkerd-retry-budget', mine: false },
  { key: 'gep', label: 'Gateway API (GEP-3388)', budget: { kind: 'gateway-windowed-pct', value: 20, floor: 10, windowSec: 10 }, cite: 'gep-3388-budget', mine: false },
  { key: 'sre', label: 'Google SRE client ratio', budget: { kind: 'rate-ratio', value: 0.1 }, cite: 'sre-client-retry-ratio', mine: false },
]

const CAPS: Record<RetryBudget['kind'], string> = {
  'envoy-concurrency-pct': 'retries in flight',
  'rate-ratio': 'retries per second',
  'gateway-windowed-pct': 'retries per second',
}

const n1 = (v: number | null) => (v === null ? '—' : v >= 100 ? Math.round(v).toLocaleString() : Number(v.toFixed(1)).toString())

export function BudgetTranslator({
  analysis: a,
  onLoad,
}: {
  analysis: Analysis
  onLoad: (field: 'rps' | 'meanLatencyMs' | 'errorRate', v: FieldValue<number>) => void
}) {
  const c = a.chain
  const rps = c.rps.state === 'unknown' ? null : c.rps.value
  const lat = c.meanLatencyMs.state === 'unknown' ? null : c.meanLatencyMs.value
  const p = c.errorRate.state === 'unknown' ? null : c.errorRate.value
  const load = rps !== null ? { rps, meanLatencyMs: lat } : null

  const mine: Row[] = a.facts
    .filter((f) => f.budget)
    .map((f) => ({ key: f.hop.id, label: f.hop.name, budget: f.budget!, mine: true }))
  const rows = [...mine, ...REFERENCE]

  // What the first retrying hop would try to send, at the declared error rate.
  const firstRetrying = a.facts.findIndex((f) => f.effectiveTries > 1)
  const ratio = p !== null && a.retryRatios && firstRetrying >= 0 ? a.retryRatios[firstRetrying]! : null
  const demandRps = ratio !== null && rps !== null ? rps * ratio : null
  const demandConc = demandRps !== null && lat !== null ? demandRps * (lat / 1000) : null

  const within = (al: BudgetAllowance): boolean | null => {
    if (al.nativeUnit === 'concurrent-retries') return demandConc === null ? null : demandConc <= al.native
    return demandRps === null ? null : demandRps <= al.native
  }

  return (
    <Panel flush>
      <PanelHeader
        title="Retry budgets, in the same units"
        hint="Three vendors call three different quantities a “retry budget”. Given your traffic, here is what each one allows."
      />
      <div className="grid gap-3 border-b border-line px-5 py-4 sm:grid-cols-3">
        <LoadInput label="Requests per second" suffix="req/s" value={c.rps} onChange={(v) => onLoad('rps', v)} />
        <LoadInput label="Mean latency" suffix="ms" value={c.meanLatencyMs} onChange={(v) => onLoad('meanLatencyMs', v)} />
        <LoadInput
          label="Attempts failing"
          suffix="%"
          value={c.errorRate.state === 'unknown' ? c.errorRate : declared(c.errorRate.value * 100)}
          onChange={(v) => onLoad('errorRate', v.state === 'unknown' ? v : declared(Math.min(100, v.value) / 100))}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-faint">
              <th scope="col" className="px-5 py-2.5 font-medium">Budget</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Caps</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Retries/s</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">In flight</th>
              <th scope="col" className="px-5 py-2.5 text-right font-medium">Your retries</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const al = translateBudget(r.budget, load)
              const ok = within(al)
              return (
                <tr key={r.key} className={cx('seam-t', r.mine && 'bg-accent-wash')}>
                  <th scope="row" className="px-5 py-2.5 text-left align-top font-normal">
                    <span className="block font-medium text-ink">{r.label}</span>
                    <span className="mt-0.5 block text-xs text-ink-faint">{al.workings}</span>
                    {r.cite ? <CiteRef id={r.cite} className="mt-0.5" /> : null}
                  </th>
                  <td className="px-3 py-2.5 align-top text-ink-dim">{CAPS[r.budget.kind]}</td>
                  <td className="px-3 py-2.5 text-right align-top font-medium text-ink" data-numeric>
                    {n1(al.asRetriesPerSecond !== null && Number.isFinite(al.asRetriesPerSecond) ? al.asRetriesPerSecond : null)}
                  </td>
                  <td className="px-3 py-2.5 text-right align-top font-medium text-ink" data-numeric>
                    {n1(al.asConcurrentRetries !== null && Number.isFinite(al.asConcurrentRetries) ? al.asConcurrentRetries : null)}
                  </td>
                  <td className="px-5 py-2.5 text-right align-top text-xs font-medium">
                    {ok === null ? (
                      <span className="text-ink-faint">—</span>
                    ) : ok ? (
                      <span className="text-safe">within</span>
                    ) : (
                      <span className="text-danger">over</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="grid gap-2 border-t border-line px-5 py-3.5 text-xs leading-relaxed text-ink-dim">
        {demandRps !== null ? (
          <p data-numeric>
            At {fmtPct(p!)} of attempts failing, <span className="font-medium text-ink">{a.facts[firstRetrying]!.hop.name}</span>{' '}
            would send about <span className="font-medium text-ink">{n1(demandRps)} retries/s</span>
            {demandConc !== null ? <> ({n1(demandConc)} in flight)</> : null}.
          </p>
        ) : (
          <p className="text-ink-faint">Enter traffic, latency and a failure rate to compare the budgets with what your path would send.</p>
        )}
        <p>
          Envoy’s 20% and Linkerd’s 20% are not the same 20%: one caps concurrency, the other caps rate. Converting between
          them uses Little’s law and holds only while latency holds — which it will not during the brownout a budget exists
          for. No vendor publishes a conversion; <CiteRef id="gep-3388-not-equivalent" /> says outright they are not
          equivalent.
        </p>
      </div>
    </Panel>
  )
}

function LoadInput({
  label,
  suffix,
  value,
  onChange,
}: {
  label: string
  suffix: string
  value: FieldValue<number>
  onChange: (v: FieldValue<number>) => void
}) {
  return (
    <label className="grid gap-1 text-xs font-medium text-ink-dim">
      {label}
      <span className="relative">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          placeholder="unknown"
          value={value.state === 'unknown' ? '' : Number(value.value.toFixed(4))}
          onChange={(e) => {
            const n = e.currentTarget.valueAsNumber
            onChange(Number.isFinite(n) && n >= 0 ? declared(n) : unknown())
          }}
          className={cx(inputBase, 'w-full pr-14')}
          data-numeric
        />
        <span className="pointer-events-none absolute inset-y-0 right-2.5 grid place-items-center text-xs font-normal text-ink-faint">
          {suffix}
        </span>
      </span>
    </label>
  )
}
