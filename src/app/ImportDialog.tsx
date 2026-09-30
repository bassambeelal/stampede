import { useState } from 'react'
import { fmtMs, fmtTries } from '../domain/format'
import type { IngestOutcome } from '../domain/ingest'
import type { Duration, FieldValue, Hop } from '../domain/model'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Dialog } from '../ui/Dialog'
import { ProvenanceMark } from './Citation'

const EXAMPLE_ISTIO = `apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: checkout
spec:
  hosts: [checkout]
  http:
  - name: place-order
    match:
    - uri: { prefix: /orders }
    timeout: 3s
    retries:
      attempts: 3
      perTryTimeout: 5s
      retryOn: 5xx,reset,connect-failure
    route:
    - destination: { host: checkout }
  - name: everything-else
    route:
    - destination: { host: checkout }
`

const EXAMPLE_ENVOY = `virtual_hosts:
- name: inventory
  domains: ["*"]
  routes:
  - match: { prefix: "/" }
    route:
      cluster: inventory
      timeout: 2s
      retry_policy:
        retry_on: 5xx,gateway-error
        num_retries: 2
        per_try_timeout: 0.8s
`

const dur = (f: FieldValue<Duration>) =>
  f.state === 'unknown' ? '?' : f.value === 'none' ? 'no limit' : fmtMs(f.value)

export function ImportDialog({
  open,
  onClose,
  startId,
  onReplace,
  onAppend,
}: {
  open: boolean
  onClose: () => void
  startId: number
  onReplace: (hops: Hop[]) => void
  onAppend: (hops: Hop[]) => void
}) {
  const [text, setText] = useState('')
  const [outcome, setOutcome] = useState<IngestOutcome | null>(null)
  const hops = outcome?.ok ? outcome.results.flatMap((r) => r.hops) : []

  // The YAML parser is only needed here, so it loads on first use rather than
  // with the page.
  const read = async (t = text) => {
    const { ingestConfig } = await import('../domain/ingest')
    setOutcome(ingestConfig(t, startId))
  }
  const close = () => {
    onClose()
    setOutcome(null)
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      width="lg"
      title="Import config"
      description="Paste an Istio VirtualService or an Envoy route configuration (YAML or JSON). Only retry and timeout settings are read; nothing leaves your browser."
      footer={
        hops.length ? (
          <>
            <Button variant="ghost" onClick={() => setOutcome(null)}>
              Back
            </Button>
            <Button onClick={() => { onAppend(hops); close() }}>Add to path</Button>
            <Button variant="primary" onClick={() => { onReplace(hops); close() }}>
              Replace path
            </Button>
          </>
        ) : (
          <Button variant="primary" onClick={() => void read()} disabled={!text.trim()}>
            Read config
          </Button>
        )
      }
    >
      {!hops.length ? (
        <div className="grid gap-3">
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.currentTarget.value)
              setOutcome(null)
            }}
            spellCheck={false}
            rows={14}
            aria-label="Configuration"
            placeholder="kind: VirtualService …"
            className="w-full resize-y rounded-md border border-line bg-canvas px-3 py-2.5 font-mono text-[0.8125rem] leading-relaxed text-ink placeholder:text-ink-faint focus:border-accent-edge focus:ring-2 focus:ring-accent-wash focus:outline-none"
          />
          {outcome && !outcome.ok ? (
            <p role="alert" className="rounded-md border border-danger-edge bg-danger-wash px-3 py-2 text-sm text-danger">
              {outcome.reason}
            </p>
          ) : null}
          <p className="flex flex-wrap items-center gap-2 text-xs text-ink-faint">
            Or load an example:
            <button type="button" className="font-medium text-accent hover:underline" onClick={() => { setText(EXAMPLE_ISTIO); void read(EXAMPLE_ISTIO) }}>
              Istio VirtualService
            </button>
            ·
            <button type="button" className="font-medium text-accent hover:underline" onClick={() => { setText(EXAMPLE_ENVOY); void read(EXAMPLE_ENVOY) }}>
              Envoy route
            </button>
          </p>
        </div>
      ) : (
        <div className="grid gap-5">
          {outcome?.ok
            ? outcome.results.map((r, i) => (
                <section key={i}>
                  <h3 className="text-xs font-medium tracking-wide text-ink-faint uppercase">
                    {r.source} · {r.hops.length} {r.hops.length === 1 ? 'hop' : 'hops'}
                  </h3>
                  <ul className="mt-2 divide-y divide-line rounded-md border border-line">
                    {r.hops.map((h) => (
                      <li key={h.id} className="grid gap-1 px-3.5 py-2.5">
                        <span className="text-sm font-medium text-ink">{h.name}</span>
                        <span className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-dim" data-numeric>
                          <Pair state={h.totalTries.state}>
                            {h.totalTries.state === 'unknown' ? 'tries ?' : fmtTries(h.totalTries.value)}
                          </Pair>
                          <Pair state={h.timeoutMs.state}>timeout {dur(h.timeoutMs)}</Pair>
                          <Pair state={h.perTryTimeoutMs.state}>per try {dur(h.perTryTimeoutMs)}</Pair>
                          <Pair state={h.retryOn.state}>
                            on {h.retryOn.state === 'unknown' ? '?' : h.retryOn.value.join(', ')}
                          </Pair>
                        </span>
                      </li>
                    ))}
                  </ul>
                  {r.notModeled.length ? (
                    <div className="mt-2.5 rounded-md border border-caution-edge bg-caution-wash px-3 py-2 text-xs text-ink-dim">
                      <p className="font-medium text-caution">Read but not modeled</p>
                      <ul className="mt-1 list-inside list-disc font-mono">
                        {r.notModeled.map((k) => (
                          <li key={k}>{k}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {r.notes.length ? (
                    <ul className="mt-2 grid gap-1 text-xs text-ink-faint">
                      {r.notes.map((n, k) => (
                        <li key={k}>{n}</li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              ))
            : null}
          <p className="flex items-center gap-4 text-xs text-ink-faint">
            <span className="inline-flex items-center gap-1.5"><ProvenanceMark state="declared" /> from your config</span>
            <span className="inline-flex items-center gap-1.5"><ProvenanceMark state="inherited" /> vendor default, not overridden</span>
          </p>
        </div>
      )}
    </Dialog>
  )
}

function Pair({ state, children }: { state: FieldValue<unknown>['state']; children: React.ReactNode }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5')}>
      <ProvenanceMark state={state} />
      {children}
    </span>
  )
}
