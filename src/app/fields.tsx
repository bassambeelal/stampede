import { useId, type ReactNode } from 'react'
import {
  declared,
  type Backoff,
  type BackoffKind,
  type BudgetKind,
  type Duration,
  type FieldState,
  type FieldValue,
  type JitterKind,
  type RetryBudget,
} from '../domain/model'
import { cx } from '../ui/cx'
import { inputBase } from '../ui/input'
import { CiteRef, ProvenanceMark } from './Citation'


// ---- the provenance switch -----------------------------------------------------

interface ProvenanceFieldProps<T> {
  label: string
  field: FieldValue<T>
  /** The layer's cited default for this field, if it has one. */
  inheritedDefault: FieldValue<T> | null
  onChange: (next: FieldValue<T>) => void
  /** Value used when switching to Set with nothing to start from. */
  seed: T
  display: (v: T) => ReactNode
  editor: (v: T, set: (v: T) => void, id: string) => ReactNode
  /** What an UNKNOWN is treated as, stated plainly. */
  unknownMeans: string
}

export function ProvenanceField<T>({
  label,
  field,
  inheritedDefault,
  onChange,
  seed,
  display,
  editor,
  unknownMeans,
}: ProvenanceFieldProps<T>) {
  const id = useId()
  const current = field.state === 'unknown' ? undefined : field.value

  const choose = (state: FieldState) => {
    if (state === field.state) return
    if (state === 'inherited' && inheritedDefault) onChange(inheritedDefault)
    if (state === 'unknown') onChange({ state: 'unknown' })
    if (state === 'declared') {
      const start =
        current !== undefined
          ? current
          : inheritedDefault && inheritedDefault.state !== 'unknown'
            ? inheritedDefault.value
            : seed
      onChange(declared(start))
    }
  }

  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={field.state === 'declared' ? id : undefined} className="flex items-center gap-1.5 text-xs font-medium text-ink-dim">
          <ProvenanceMark state={field.state} />
          {label}
        </label>
        <StateSwitch
          label={label}
          value={field.state}
          hasDefault={inheritedDefault !== null}
          onChange={choose}
        />
      </div>
      {field.state === 'declared' ? (
        editor(field.value, (v) => onChange(declared(v)), id)
      ) : field.state === 'inherited' ? (
        <p className="flex min-h-8 flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md border border-dashed border-accent-edge/70 px-2.5 py-1 text-sm text-ink">
          <span className="font-medium">{display(field.value)}</span>
          <span className="text-xs text-ink-faint">vendor default ·</span>
          <CiteRef id={field.citationId} />
        </p>
      ) : (
        <p className="flex min-h-8 items-center rounded-md border border-dashed border-caution-edge px-2.5 py-1 text-xs text-ink-dim">
          {unknownMeans}
        </p>
      )}
    </div>
  )
}

function StateSwitch({
  label,
  value,
  hasDefault,
  onChange,
}: {
  label: string
  value: FieldState
  hasDefault: boolean
  onChange: (s: FieldState) => void
}) {
  const opts: { v: FieldState; text: string; title: string }[] = [
    { v: 'inherited', text: 'Default', title: 'Use the vendor’s documented default' },
    { v: 'declared', text: 'Set', title: 'Enter the value you run' },
    { v: 'unknown', text: '?', title: 'I don’t know' },
  ]
  return (
    <div role="group" aria-label={`${label}: source`} className="inline-flex rounded-md border border-line bg-canvas p-px">
      {opts.map((o) => {
        const disabled = o.v === 'inherited' && !hasDefault
        const on = value === o.v
        return (
          <button
            key={o.v}
            type="button"
            title={disabled ? 'This layer documents no default for this' : o.title}
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onChange(o.v)}
            className={cx(
              'h-6 min-w-6 rounded-[5px] px-1.5 text-micro font-semibold transition-colors',
              on
                ? o.v === 'unknown'
                  ? 'bg-caution-wash text-caution'
                  : o.v === 'inherited'
                    ? 'bg-accent-wash text-accent'
                    : 'bg-raised text-ink shadow-e1'
                : 'text-ink-faint hover:text-ink-dim',
              disabled && 'cursor-not-allowed opacity-35 hover:text-ink-faint',
            )}
          >
            {o.text}
          </button>
        )
      })}
    </div>
  )
}

// ---- editors -------------------------------------------------------------------

export function NumberInput({
  id,
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  suffix,
  className,
  ariaLabel,
}: {
  id?: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  suffix?: string
  className?: string
  ariaLabel?: string
}) {
  return (
    <div className={cx('relative', className)}>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        aria-label={ariaLabel}
        value={Number.isFinite(value) ? value : ''}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = e.currentTarget.valueAsNumber
          if (Number.isFinite(n)) onChange(Math.max(min, max === undefined ? n : Math.min(max, n)))
        }}
        className={cx(inputBase, 'w-full', suffix && 'pr-9')}
        data-numeric
      />
      {suffix ? (
        <span className="pointer-events-none absolute inset-y-0 right-2.5 grid place-items-center text-xs text-ink-faint">
          {suffix}
        </span>
      ) : null}
    </div>
  )
}

export function DurationInput({
  id,
  value,
  onChange,
}: {
  id?: string
  value: Duration
  onChange: (v: Duration) => void
}) {
  const none = value === 'none'
  return (
    <div className="flex items-center gap-2">
      <NumberInput
        id={id}
        value={none ? Number.NaN : value}
        onChange={(v) => onChange(Math.round(v))}
        suffix="ms"
        step={50}
        className={cx('flex-1', none && 'opacity-50')}
        ariaLabel="Milliseconds"
      />
      <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-ink-dim">
        <input
          type="checkbox"
          checked={none}
          onChange={(e) => onChange(e.currentTarget.checked ? 'none' : 1000)}
          className="size-3.5 accent-[var(--color-accent-solid)]"
        />
        No limit
      </label>
    </div>
  )
}

export function TriesInput({ id, value, onChange }: { id?: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <NumberInput id={id} value={value} onChange={(v) => onChange(Math.max(1, Math.round(v)))} min={1} max={20} className="w-20" ariaLabel="Total calls" />
      <span className="text-xs text-ink-faint">
        total calls = 1 + {Math.max(0, value - 1)} {value - 1 === 1 ? 'retry' : 'retries'}
      </span>
    </div>
  )
}

export function TokensInput({
  id,
  value,
  onChange,
}: {
  id?: string
  value: readonly string[]
  onChange: (v: string[]) => void
}) {
  return (
    <input
      id={id}
      type="text"
      spellCheck={false}
      defaultValue={value.join(', ')}
      placeholder="e.g. 5xx, connect-failure, transient"
      onBlur={(e) =>
        onChange(
          e.currentTarget.value
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        )
      }
      className={cx(inputBase, 'w-full font-mono text-[0.8125rem]')}
    />
  )
}

const selectClass = cx(inputBase, 'pr-7')

export function Select<T extends string>({
  id,
  value,
  options,
  onChange,
  ariaLabel,
  className,
}: {
  id?: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (v: T) => void
  ariaLabel?: string
  className?: string
}) {
  return (
    <select
      id={id}
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.currentTarget.value as T)}
      className={cx(selectClass, className)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

const BACKOFF_KINDS: { value: BackoffKind; label: string }[] = [
  { value: 'none', label: 'No wait' },
  { value: 'fixed', label: 'Fixed' },
  { value: 'exponential', label: 'Exponential' },
  { value: 'envoy-exponential', label: 'Envoy series' },
]

const JITTERS: { value: JitterKind; label: string }[] = [
  { value: 'none', label: 'No jitter' },
  { value: 'full', label: 'Full jitter' },
  { value: 'equal', label: 'Equal jitter' },
  { value: 'decorrelated', label: 'Decorrelated' },
]

export function BackoffEditor({ id, value, onChange }: { id?: string; value: Backoff; onChange: (b: Backoff) => void }) {
  const set = (p: Partial<Backoff>) => onChange({ ...value, ...p })
  const waits = value.kind !== 'none'
  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-2 gap-2">
        <Select id={id} ariaLabel="Backoff shape" value={value.kind} options={BACKOFF_KINDS} onChange={(kind) => set({ kind })} />
        <Select ariaLabel="Jitter" value={value.jitter} options={JITTERS} onChange={(jitter) => set({ jitter })} className={cx(!waits && 'opacity-50')} />
      </div>
      {waits ? (
        <div className="grid grid-cols-3 gap-2">
          <Labeled text="Base">
            <NumberInput value={value.baseMs} onChange={(baseMs) => set({ baseMs })} suffix="ms" step={25} ariaLabel="Base wait" />
          </Labeled>
          <Labeled text="Growth">
            <NumberInput
              value={value.multiplier}
              onChange={(multiplier) => set({ multiplier: Math.max(1, multiplier) })}
              min={1}
              step={0.5}
              suffix="×"
              ariaLabel="Multiplier"
              className={cx(value.kind !== 'exponential' && 'opacity-50')}
            />
          </Labeled>
          <Labeled text="Cap">
            <NumberInput
              value={value.capMs === 'none' ? Number.NaN : value.capMs}
              onChange={(capMs) => set({ capMs })}
              suffix="ms"
              step={50}
              ariaLabel="Maximum wait"
            />
          </Labeled>
        </div>
      ) : null}
    </div>
  )
}

function Labeled({ text, children }: { text: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-micro text-ink-faint">
      {text}
      {children}
    </label>
  )
}

const BUDGET_KINDS: { value: BudgetKind | 'none'; label: string }[] = [
  { value: 'none', label: 'No budget' },
  { value: 'envoy-concurrency-pct', label: 'Envoy — % of in-flight' },
  { value: 'rate-ratio', label: 'Ratio of requests (SRE, Linkerd)' },
  { value: 'gateway-windowed-pct', label: 'Gateway API — % over window' },
]

const BUDGET_PRESET: Record<BudgetKind, RetryBudget> = {
  'envoy-concurrency-pct': { kind: 'envoy-concurrency-pct', value: 20, floor: 3 },
  'rate-ratio': { kind: 'rate-ratio', value: 0.2, floor: 10, windowSec: 10 },
  'gateway-windowed-pct': { kind: 'gateway-windowed-pct', value: 20, floor: 10, windowSec: 10 },
}

export function BudgetEditor({
  id,
  value,
  onChange,
}: {
  id?: string
  value: RetryBudget | null
  onChange: (b: RetryBudget | null) => void
}) {
  const ratio = value?.kind === 'rate-ratio'
  return (
    <div className="grid gap-2">
      <Select
        id={id}
        ariaLabel="Budget kind"
        value={value?.kind ?? 'none'}
        options={BUDGET_KINDS}
        onChange={(k) => onChange(k === 'none' ? null : BUDGET_PRESET[k])}
      />
      {value ? (
        <div className="grid grid-cols-2 gap-2">
          <Labeled text={ratio ? 'Ratio' : 'Percent'}>
            <NumberInput
              value={ratio ? value.value * 100 : value.value}
              onChange={(v) => onChange({ ...value, value: ratio ? v / 100 : v })}
              max={100}
              suffix="%"
              ariaLabel="Budget"
            />
          </Labeled>
          <Labeled text={value.kind === 'envoy-concurrency-pct' ? 'Floor (concurrent)' : 'Floor (per second)'}>
            <NumberInput value={value.floor ?? 0} onChange={(floor) => onChange({ ...value, floor })} ariaLabel="Floor" />
          </Labeled>
        </div>
      ) : null}
    </div>
  )
}
