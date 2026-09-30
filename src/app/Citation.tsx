import { ExternalLink, Quote } from 'lucide-react'
import type { CitationId, FieldState } from '../domain/model'
import { citation } from '../domain/registry/citations'
import { cx } from '../ui/cx'
import { Tooltip } from '../ui/Tooltip'

/**
 * The provenance mark. Three shapes, not three colours, so the distinction
 * survives greyscale and colour-vision differences:
 *   declared   a filled dot   — you told us
 *   inherited  a ring         — a vendor default, with a citation
 *   unknown    a dashed ring  — you said you do not know
 */
export function ProvenanceMark({
  state,
  className,
}: {
  state: FieldState
  className?: string
}) {
  const label =
    state === 'declared' ? 'Declared by you' : state === 'inherited' ? 'Vendor default' : 'Unknown'
  return (
    <svg
      viewBox="0 0 10 10"
      width={10}
      height={10}
      role="img"
      aria-label={label}
      className={cx('shrink-0', className)}
    >
      {state === 'declared' ? (
        <circle cx="5" cy="5" r="4" className="fill-ink-dim" />
      ) : state === 'inherited' ? (
        <circle cx="5" cy="5" r="3.4" fill="none" strokeWidth="1.6" className="stroke-accent" />
      ) : (
        <circle
          cx="5"
          cy="5"
          r="3.4"
          fill="none"
          strokeWidth="1.4"
          strokeDasharray="1.8 1.6"
          className="stroke-caution"
        />
      )}
    </svg>
  )
}

/** A compact, hoverable citation reference: product · title, quote on hover. */
export function CiteRef({ id, className }: { id: CitationId; className?: string }) {
  const c = citation(id)
  return (
    <Tooltip
      width={340}
      content={
        <span className="block">
          <span className="mb-1 block font-medium text-ink">
            {c.product} — {c.title}
          </span>
          <span className="block text-ink-dim italic">“{c.quote}”</span>
          <span className="mt-1.5 block text-micro text-ink-faint">
            Read {c.retrieved} · {c.docVersion}
          </span>
        </span>
      }
    >
      {(t) => (
        <a
          {...t}
          href={c.url}
          target="_blank"
          rel="noreferrer"
          className={cx(
            'inline-flex max-w-full items-center gap-1 rounded-xs text-xs text-accent underline decoration-accent-edge underline-offset-2 hover:decoration-accent',
            className,
          )}
        >
          <span className="truncate">{c.product}</span>
          <ExternalLink size={11} className="shrink-0" aria-hidden />
        </a>
      )}
    </Tooltip>
  )
}

/** The full quote block, used inside expanded findings. */
export function CitationBlock({ id }: { id: CitationId }) {
  const c = citation(id)
  return (
    <figure className="rounded-md border border-line bg-canvas/50 px-3.5 py-3">
      <blockquote className="flex gap-2.5 text-sm leading-relaxed text-ink-dim">
        <Quote size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden />
        <p className="min-w-0 break-words">{c.quote}</p>
      </blockquote>
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pl-6 text-xs text-ink-faint">
        <a
          href={c.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-medium text-accent hover:underline"
        >
          {c.product} — {c.title}
          <ExternalLink size={11} aria-hidden />
        </a>
        <span>
          {c.docVersion} · read {c.retrieved}
        </span>
      </figcaption>
    </figure>
  )
}
