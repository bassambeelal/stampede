import { BookOpen, Library } from 'lucide-react'
import { useState } from 'react'
import type { Citation } from '../domain/model'
import { CITATIONS } from '../domain/registry/citations'
import { RULES } from '../domain/rules'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { CiteRef } from './Citation'
import { SEVERITY_LABEL, SEVERITY_TONE } from './severity'

const NOTES = [
  {
    title: 'Defaults are cited, never guessed',
    body: 'Every inherited value links to the vendor sentence that establishes it, with the date it was read. A field no vendor documents starts as unknown, and unknowns are resolved in the direction that cannot understate the problem.',
  },
  {
    title: 'Worst case, labelled as one',
    body: 'Amplification is the product of every layer’s tries for one failure class: the bound when every attempt fails and nothing sheds load. Budgets, breakers and outlier ejection act on live traffic, which configuration cannot show.',
  },
  {
    title: 'What it refuses to compute',
    body: 'No composed percentiles — adding up per-hop p99s describes no request that ever happened. No fan-out topologies, hedged requests or streams: a single linear path, or nothing.',
  },
  {
    title: 'Only retries, timeouts and budgets',
    body: 'Validating the rest of a mesh config is istioctl analyze’s job. Stampede reads a pasted config in your browser and nothing is sent anywhere.',
  },
]

export function MethodNotes() {
  const [open, setOpen] = useState<'rules' | 'sources' | null>(null)
  const byProduct = new Map<string, Citation[]>()
  for (const ct of CITATIONS.values()) {
    byProduct.set(ct.product, [...(byProduct.get(ct.product) ?? []), ct])
  }

  return (
    <section aria-labelledby="method-heading" className="border-t border-line pt-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="method-heading" className="text-xl font-semibold tracking-tight text-ink">
            How it decides
          </h2>
          <p className="mt-1 max-w-prose text-sm text-ink-dim">
            A linter is only as useful as it is trustworthy, so the limits of the model are part of the product.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" icon={<BookOpen size={14} aria-hidden />} onClick={() => setOpen('rules')}>
            Rule reference
          </Button>
          <Button size="sm" icon={<Library size={14} aria-hidden />} onClick={() => setOpen('sources')}>
            All {CITATIONS.size} sources
          </Button>
        </div>
      </div>
      <div className="mt-6 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
        {NOTES.map((n) => (
          <div key={n.title}>
            <h3 className="text-sm font-semibold text-ink">{n.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-dim">{n.body}</p>
          </div>
        ))}
      </div>

      <Dialog open={open === 'rules'} onClose={() => setOpen(null)} width="xl" title="Rule reference" description="Every rule, what it looks for, and when it is wrong.">
        <ul className="divide-y divide-line">
          {RULES.map((r) => (
            <li key={r.id} className="grid gap-1.5 py-3.5 first:pt-0">
              <p className="flex flex-wrap items-center gap-2">
                <code className="rounded-xs bg-raised px-1.5 py-px text-micro font-medium text-ink-dim">{r.id}</code>
                <span className="text-sm font-semibold text-ink">{r.title}</span>
                <Badge tone={SEVERITY_TONE[r.severity]}>{SEVERITY_LABEL[r.severity]}</Badge>
              </p>
              <p className="text-sm text-ink-dim">{r.detects}</p>
              <p className="text-xs text-ink-faint">
                <span className="font-medium text-ink-dim">When it is wrong: </span>
                {r.falsePositives}
              </p>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-faint">
                {r.citations.length ? (
                  <>
                    Sources:
                    {r.citations.map((id) => (
                      <CiteRef key={id} id={id} />
                    ))}
                  </>
                ) : (
                  'Cites the documentation of the layer involved.'
                )}
              </p>
            </li>
          ))}
        </ul>
      </Dialog>

      <Dialog
        open={open === 'sources'}
        onClose={() => setOpen(null)}
        width="xl"
        title="Sources"
        description="Every quote is verbatim from the linked page, as read on the date shown. Defaults drift between versions — check them against what you run."
      >
        <div className="grid gap-6">
          {[...byProduct.entries()].map(([product, cites]) => (
            <section key={product}>
              <h3 className="mb-2 text-xs font-medium tracking-wide text-ink-faint uppercase">{product}</h3>
              <ul className="grid gap-2.5">
                {cites.map((ct) => (
                  <li key={ct.id} className="text-sm">
                    <a href={ct.url} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
                      {ct.title}
                    </a>
                    <span className="text-xs text-ink-faint"> · {ct.docVersion} · read {ct.retrieved}</span>
                    <p className="mt-0.5 text-ink-dim italic">“{ct.quote}”</p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </Dialog>
    </section>
  )
}
