import { FileCode, Plus, RotateCcw, User } from 'lucide-react'
import type { Analysis } from '../domain/analyze'
import type { Hop } from '../domain/model'
import { Button } from '../ui/Button'
import { HopCard } from './HopCard'
import { MAX_HOPS } from './state'

/**
 * The request path, outermost first. The "+" between hops matters: layers are
 * rarely added at the end, they are discovered in the middle ("oh, the SDK
 * retries too").
 */
export function PathEditor({
  analysis: a,
  highlight,
  onInsertAt,
  onChange,
  onMove,
  onRemove,
  onImport,
  onReset,
}: {
  analysis: Analysis
  highlight: ReadonlySet<string>
  onInsertAt: (index: number) => void
  onChange: (id: string, patch: Partial<Hop>) => void
  onMove: (id: string, by: -1 | 1) => void
  onRemove: (id: string) => void
  onImport: () => void
  onReset: () => void
}) {
  const full = a.facts.length >= MAX_HOPS

  return (
    <section aria-labelledby="path-heading" className="grid grid-cols-1 gap-3">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="path-heading" className="text-base font-semibold text-ink">
            Request path
          </h2>
          <p className="mt-0.5 text-xs text-ink-faint">Outermost first. Every layer starts on its vendor’s defaults.</p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Button size="sm" variant="ghost" icon={<RotateCcw size={13} aria-hidden />} onClick={onReset} title="Back to the defaults-only example">
            Reset
          </Button>
          <Button size="sm" icon={<FileCode size={13} aria-hidden />} onClick={onImport}>
            Import config
          </Button>
        </div>
      </header>

      <ol className="grid grid-cols-1">
        <li className="flex items-center gap-2.5 pb-1 pl-1 text-xs text-ink-faint">
          <span className="grid size-6 place-items-center rounded-full border border-line bg-raised">
            <User size={12} aria-hidden />
          </span>
          User request
        </li>
        {a.facts.map((f, i) => (
          <li key={f.hop.id} className="grid grid-cols-1">
            <Insert onClick={() => onInsertAt(i)} disabled={full} label={`Add a layer before ${f.hop.name}`} />
            <HopCard
              facts={f}
              isFirst={i === 0}
              isLast={i === a.facts.length - 1}
              highlighted={highlight.has(f.hop.id)}
              onChange={(patch) => onChange(f.hop.id, patch)}
              onMove={(by) => onMove(f.hop.id, by)}
              onRemove={() => onRemove(f.hop.id)}
            />
          </li>
        ))}
        <li className="mt-3">
          <button
            type="button"
            disabled={full}
            onClick={() => onInsertAt(a.facts.length)}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong py-3 text-sm font-medium text-ink-dim transition-colors hover:border-accent-edge hover:bg-accent-wash hover:text-accent disabled:pointer-events-none disabled:opacity-40"
          >
            <Plus size={15} aria-hidden />
            {full ? `Up to ${MAX_HOPS} layers` : a.facts.length ? 'Add an inner layer' : 'Add the first layer'}
          </button>
        </li>
      </ol>
    </section>
  )
}

/** The connector between hops, which doubles as an insertion point. */
function Insert({ onClick, disabled, label }: { onClick: () => void; disabled: boolean; label: string }) {
  return (
    <div className="group relative flex h-7 items-center pl-[1.05rem]">
      <span className="h-full w-px bg-line-strong" aria-hidden />
      <button
        type="button"
        aria-label={label}
        title={label}
        disabled={disabled}
        onClick={onClick}
        className="absolute left-[0.55rem] grid size-[1.1rem] place-items-center rounded-full border border-line-strong bg-canvas text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 [@media(hover:none)]:opacity-100 hover:border-accent hover:text-accent focus-visible:opacity-100 disabled:hidden"
      >
        <Plus size={11} aria-hidden />
      </button>
    </div>
  )
}
