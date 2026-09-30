import { PencilLine } from 'lucide-react'
import { fmtTries } from '../domain/format'
import type { LayerKind, LayerTier } from '../domain/model'
import { LAYERS } from '../domain/registry/layers'
import { cx } from '../ui/cx'
import { Dialog } from '../ui/Dialog'

const GROUPS: { tier: LayerTier; title: string }[] = [
  { tier: 'edge', title: 'Edge and ingress' },
  { tier: 'mesh', title: 'Service mesh' },
  { tier: 'sdk', title: 'Client SDKs' },
  { tier: 'library', title: 'Application libraries' },
]

export function LayerPicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  onPick: (layerId: string | null) => void
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      width="xl"
      title="Add a layer"
      description="Each layer arrives with its vendor’s documented defaults, cited. Change any field afterwards."
    >
      <div className="grid gap-6">
        {GROUPS.map((g) => {
          const layers = LAYERS.filter((l) => l.tier === g.tier)
          if (!layers.length) return null
          return (
            <section key={g.tier}>
              <h3 className="mb-2 text-xs font-medium tracking-wide text-ink-faint uppercase">{g.title}</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {layers.map((l) => (
                  <LayerOption key={l.id} layer={l} onPick={() => onPick(l.id)} />
                ))}
              </div>
            </section>
          )
        })}
        <section>
          <h3 className="mb-2 text-xs font-medium tracking-wide text-ink-faint uppercase">Anything else</h3>
          <button
            type="button"
            onClick={() => onPick(null)}
            className="flex w-full items-start gap-3 rounded-lg border border-dashed border-line-strong px-4 py-3 text-left transition-colors hover:border-accent-edge hover:bg-accent-wash"
          >
            <PencilLine size={18} className="mt-0.5 shrink-0 text-ink-faint" aria-hidden />
            <span>
              <span className="block text-sm font-semibold text-ink">Custom hop</span>
              <span className="mt-0.5 block text-xs text-ink-dim">
                A database driver, an in-house client, a fetch wrapper. Starts with every field unknown until you fill it
                in — an unfinished hop never reads as safe.
              </span>
            </span>
          </button>
        </section>
      </div>
    </Dialog>
  )
}

function LayerOption({ layer: l, onPick }: { layer: LayerKind; onPick: () => void }) {
  const tries = l.defaults.totalTries?.value ?? null
  const retries = tries !== null && tries > 1
  return (
    <button
      type="button"
      onClick={onPick}
      className="group flex h-full flex-col rounded-lg border border-line bg-canvas/40 px-4 py-3 text-left transition-[border-color,background-color] duration-150 hover:border-accent-edge hover:bg-accent-wash"
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-ink">{l.label}</span>
        {tries !== null ? (
          <span className={cx('shrink-0 text-xs font-medium', retries ? 'text-danger' : 'text-safe')} data-numeric>
            {retries ? fmtTries(tries) : 'no retries'}
          </span>
        ) : null}
      </span>
      <span className="mt-1 text-xs text-ink-dim">{l.blurb}</span>
      {l.surprise ? <span className="mt-2 text-xs leading-relaxed text-ink-faint">{l.surprise}</span> : null}
    </button>
  )
}
