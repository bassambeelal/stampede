import { ArrowDown, ArrowUp, ChevronDown, Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import type { HopFacts } from '../domain/analyze'
import { fmtMs, fmtPct, fmtTries } from '../domain/format'
import { inheritedValue } from '../domain/hops'
import {
  declared,
  NO_BACKOFF,
  type Backoff,
  type Duration,
  type FieldValue,
  type Hop,
  type TimeoutScope,
} from '../domain/model'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { inputBase } from '../ui/input'
import { SegmentedControl } from '../ui/SegmentedControl'
import { ProvenanceMark } from './Citation'
import {
  BackoffEditor,
  BudgetEditor,
  DurationInput,
  ProvenanceField,
  Select,
  TokensInput,
  TriesInput,
} from './fields'

const TIER_LABEL = { edge: 'Edge', mesh: 'Mesh', sdk: 'SDK', library: 'Library', app: 'App' } as const

const dur = (d: Duration) => (d === 'none' ? 'no limit' : fmtMs(d))

function backoffSummary(b: Backoff): string {
  if (b.kind === 'none' || b.baseMs === 0) return 'no wait'
  const jit = b.jitter === 'none' ? 'no jitter' : `${b.jitter} jitter`
  const cap = b.capMs === 'none' ? '' : `, cap ${fmtMs(b.capMs)}`
  const shape =
    b.kind === 'fixed'
      ? `fixed ${fmtMs(b.baseMs)}`
      : b.kind === 'envoy-exponential'
        ? `Envoy series from ${fmtMs(b.baseMs)}`
        : `${fmtMs(b.baseMs)} × ${b.multiplier}`
  return `${shape}${cap}, ${jit}`
}

export function HopCard({
  facts: f,
  isFirst,
  isLast,
  highlighted,
  onChange,
  onMove,
  onRemove,
}: {
  facts: HopFacts
  isFirst: boolean
  isLast: boolean
  highlighted: boolean
  onChange: (patch: Partial<Hop>) => void
  onMove: (by: -1 | 1) => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(false)
  const bodyId = useId()
  const hop = f.hop

  return (
    <article
      className={cx(
        'rounded-lg border bg-surface transition-[border-color,box-shadow] duration-200',
        highlighted ? 'border-accent-edge shadow-glow' : 'border-line shadow-e1',
      )}
    >
      <div className="flex items-start gap-2 px-3.5 pt-3 pb-3">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((o) => !o)}
          className="-m-1 min-w-0 flex-1 rounded-md p-1 text-left"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 truncate text-sm font-semibold text-ink">{hop.name}</span>
            {f.layer ? <Badge tone="neutral">{TIER_LABEL[f.layer.tier]}</Badge> : <Badge tone="neutral">Custom</Badge>}
          </span>
          <span className="mt-0.5 block truncate text-xs text-ink-faint">{f.layer?.label ?? 'Hand-entered hop'}</span>
          <span className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-dim" data-numeric>
            <Fact state={hop.totalTries.state}>
              {f.triesKnown ? `${f.totalTries} ${f.totalTries === 1 ? 'call' : 'calls'}` : 'tries ?'}
            </Fact>
            <Fact state={hop.timeoutMs.state}>
              timeout {hop.timeoutMs.state === 'unknown' ? '?' : dur(hop.timeoutMs.value)}
            </Fact>
            {f.totalTries > 1 ? (
              <Fact state={hop.perTryTimeoutMs.state}>
                per try {hop.perTryTimeoutMs.state === 'unknown' ? '?' : dur(hop.perTryTimeoutMs.value)}
              </Fact>
            ) : null}
          </span>
          {f.totalTries > 1 ? (
            <span
              className={cx(
                'mt-2 inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-micro font-semibold uppercase',
                f.retriesThisClass
                  ? f.retryOnAssumed
                    ? 'bg-caution-wash text-caution'
                    : 'bg-danger-wash text-danger'
                  : 'bg-raised text-ink-faint',
              )}
            >
              {f.retriesThisClass ? (f.retryOnAssumed ? 'Assumed to retry this' : 'Retries this failure') : 'Passes this failure through'}
            </span>
          ) : null}
          {hop.disabledReason ? (
            <span className="mt-2 block text-xs text-ink-faint">Retries turned off: {hop.disabledReason}</span>
          ) : null}
        </button>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button variant="ghost" size="sm" iconOnly aria-label={`Move ${hop.name} outward`} disabled={isFirst} icon={<ArrowUp size={14} />} onClick={() => onMove(-1)} />
          <Button variant="ghost" size="sm" iconOnly aria-label={`Move ${hop.name} inward`} disabled={isLast} icon={<ArrowDown size={14} />} onClick={() => onMove(1)} />
          <Button variant="ghost" size="sm" iconOnly aria-label={`Remove ${hop.name}`} icon={<Trash2 size={14} />} onClick={onRemove} />
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label={open ? 'Collapse' : 'Edit'}
            aria-expanded={open}
            aria-controls={bodyId}
            icon={<ChevronDown size={15} className={cx('transition-transform duration-200', open && 'rotate-180')} />}
            onClick={() => setOpen((o) => !o)}
          />
        </div>
      </div>

      {open ? (
        <div id={bodyId} className="grid gap-4 border-t border-line px-3.5 py-4 motion-safe:animate-[rise_180ms_var(--ease-out-quint)]">
          {f.layer?.surprise ? (
            <p className="rounded-md bg-accent-wash px-3 py-2 text-xs leading-relaxed text-ink-dim">
              <span className="font-semibold text-accent">Why this layer is here: </span>
              {f.layer.surprise}
            </p>
          ) : null}
          <HopEditor facts={f} onChange={onChange} />
        </div>
      ) : null}
    </article>
  )
}

function Fact({ state, children }: { state: FieldValue<unknown>['state']; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <ProvenanceMark state={state} />
      {children}
    </span>
  )
}

function HopEditor({ facts: f, onChange }: { facts: HopFacts; onChange: (patch: Partial<Hop>) => void }) {
  const hop = f.hop
  const nameId = useId()
  const [reason, setReason] = useState('')
  const canDisable = hop.totalTries.state === 'inherited' && f.totalTries > 1

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <label htmlFor={nameId} className="text-xs font-medium text-ink-dim">
          Name
        </label>
        <input
          // Uncontrolled so typing does not re-run the analysis per keystroke;
          // keyed by the value so an undo or import shows the real name.
          key={hop.name}
          id={nameId}
          type="text"
          maxLength={60}
          defaultValue={hop.name}
          onBlur={(e) => {
            const name = e.currentTarget.value.trim()
            if (name && name !== hop.name) onChange({ name })
          }}
          className={cx(inputBase, 'w-full')}
        />
      </div>

      <ProvenanceField
        label="Calls per request"
        field={hop.totalTries}
        inheritedDefault={inheritedValue(hop, 'totalTries')}
        onChange={(totalTries) => onChange({ totalTries, disabledReason: undefined })}
        seed={1}
        display={(v) => fmtTries(v)}
        editor={(v, set, id) => <TriesInput id={id} value={v} onChange={set} />}
        unknownMeans="Counted as a single call, so every amplification figure becomes a lower bound."
      />

      {canDisable ? (
        <form
          className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-line px-2.5 py-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!reason.trim()) return
            onChange({ totalTries: declared(1), disabledReason: reason.trim() })
            setReason('')
          }}
        >
          <span className="text-xs text-ink-dim">Turned this default off?</span>
          <input
            value={reason}
            onChange={(e) => setReason(e.currentTarget.value)}
            placeholder="Where — e.g. “MeshConfig attempts: 0”"
            aria-label="Where the default is turned off"
            className={cx(inputBase, 'h-7 min-w-0 flex-1 text-xs')}
          />
          <Button type="submit" size="sm" disabled={!reason.trim()}>
            Record
          </Button>
        </form>
      ) : null}

      <div className="grid gap-1.5">
        <span className="text-xs font-medium text-ink-dim">The timeout below covers</span>
        <SegmentedControl<TimeoutScope>
          label="Timeout scope"
          size="sm"
          value={hop.timeoutScope}
          onChange={(timeoutScope) => onChange({ timeoutScope })}
          options={[
            { value: 'includes-retries', label: 'All attempts', hint: 'One deadline for the whole call, retries included (Envoy, gRPC deadlines)' },
            { value: 'per-attempt', label: 'Each attempt', hint: 'The timeout restarts for every attempt (most SDK socket timeouts)' },
          ]}
        />
      </div>

      <ProvenanceField
        label={hop.timeoutScope === 'includes-retries' ? 'Timeout (whole call)' : 'Timeout (each attempt)'}
        field={hop.timeoutMs}
        inheritedDefault={inheritedValue(hop, 'timeoutMs')}
        onChange={(timeoutMs) => onChange({ timeoutMs })}
        seed={5000}
        display={dur}
        editor={(v, set, id) => <DurationInput id={id} value={v} onChange={set} />}
        unknownMeans="Treated as no limit. The deadline figures on this hop are then bounds only from its caller."
      />

      {f.totalTries > 1 ? (
        <>
          <ProvenanceField
            label="Per-try timeout"
            field={hop.perTryTimeoutMs}
            inheritedDefault={inheritedValue(hop, 'perTryTimeoutMs')}
            onChange={(perTryTimeoutMs) => onChange({ perTryTimeoutMs })}
            seed={1000}
            display={dur}
            editor={(v, set, id) => <DurationInput id={id} value={v} onChange={set} />}
            unknownMeans="Treated as no per-attempt limit: one slow attempt may use the whole deadline."
          />

          <ProvenanceField
            label="Backoff between tries"
            field={hop.backoff}
            inheritedDefault={inheritedValue(hop, 'backoff')}
            onChange={(backoff) => onChange({ backoff })}
            seed={{ ...NO_BACKOFF, kind: 'exponential', baseMs: 100, multiplier: 2, jitter: 'full' }}
            display={backoffSummary}
            editor={(v, set, id) => <BackoffEditor id={id} value={v} onChange={set} />}
            unknownMeans="Treated as no wait, which lets the most attempts fit inside each deadline."
          />

          <ProvenanceField
            label="Retries on"
            field={hop.retryOn}
            inheritedDefault={inheritedValue(hop, 'retryOn')}
            onChange={(retryOn) => onChange({ retryOn })}
            seed={[]}
            display={(v) => <code className="font-mono text-[0.8125rem]">{v.join(', ') || 'nothing'}</code>}
            editor={(v, set, id) => <TokensInput id={id} value={v} onChange={set} />}
            unknownMeans="Assumed to retry every failure, so amplification is never understated."
          />

          <ProvenanceField
            label="Safe to repeat"
            field={hop.idempotent}
            inheritedDefault={inheritedValue(hop, 'idempotent')}
            onChange={(idempotent) => onChange({ idempotent })}
            seed={true}
            display={(v) => (v ? 'Yes — idempotent' : 'No — repeats the work')}
            editor={(v, set, id) => (
              <Select
                id={id}
                value={v ? 'yes' : 'no'}
                onChange={(x) => set(x === 'yes')}
                options={[
                  { value: 'yes', label: 'Yes — idempotent' },
                  { value: 'no', label: 'No — repeats the work' },
                ]}
              />
            )}
            unknownMeans="Unknown. If this operation writes, a retry after a timeout can perform it twice."
          />

          <ProvenanceField
            label="Retry budget"
            field={hop.budget}
            inheritedDefault={inheritedValue(hop, 'budget')}
            onChange={(budget) => onChange({ budget })}
            seed={null}
            display={(v) =>
              v
                ? `${v.kind === 'rate-ratio' ? fmtPct(v.value) : `${v.value}%`} ${v.kind === 'envoy-concurrency-pct' ? 'of in-flight' : 'of requests'}${v.floor ? `, floor ${v.floor}` : ''}`
                : 'None'
            }
            editor={(v, set, id) => <BudgetEditor id={id} value={v} onChange={set} />}
            unknownMeans="Unknown whether anything caps retries here."
          />
        </>
      ) : null}
    </div>
  )
}
