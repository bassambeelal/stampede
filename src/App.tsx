import { CircleAlert, Undo2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AmplificationCurve } from './app/AmplificationCurve'
import { BudgetTranslator } from './app/BudgetTranslator'
import { DeadlineWaterfall } from './app/DeadlineWaterfall'
import { FanoutDiagram } from './app/FanoutDiagram'
import { Findings } from './app/Findings'
import { Header, Logo, REPO_URL } from './app/Header'
import { ImportDialog } from './app/ImportDialog'
import { LayerPicker } from './app/LayerPicker'
import { MethodNotes } from './app/MethodNotes'
import { PathEditor } from './app/PathEditor'
import { permalinkFor, useChain } from './app/state'
import { Verdict } from './app/Verdict'
import { analyze } from './domain/analyze'
import { defaultsOnlyChain } from './domain/hops'
import type { Chain, Finding } from './domain/model'
import { applyRemedy } from './domain/remedy'
import { buildReport } from './domain/report'
import { encodeChain } from './domain/serialize'
import { useTheme } from './lib/useTheme'
import { Button } from './ui/Button'

const EMPTY: ReadonlySet<string> = new Set()

export default function App() {
  const { chain, dispatch, linkError, dismissLinkError, openedFromLink } = useChain()
  const theme = useTheme()
  const analysis = useMemo(() => analyze(chain), [chain])

  const [highlight, setHighlight] = useState<ReadonlySet<string>>(EMPTY)
  const [pickerAt, setPickerAt] = useState<number | null>(null)
  const [importing, setImporting] = useState(false)
  const [undo, setUndo] = useState<{ chain: Chain; message: string } | null>(null)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const onHighlight = useCallback((ids: readonly string[]) => {
    setHighlight(ids.length ? new Set(ids) : EMPTY)
  }, [])

  const remember = (message: string) => {
    setUndo({ chain, message })
    clearTimeout(undoTimer.current)
    undoTimer.current = setTimeout(() => setUndo(null), 7000)
  }
  useEffect(() => () => clearTimeout(undoTimer.current), [])

  const onApply = (f: Finding) => {
    const remedy = f.remedy
    if (remedy?.kind !== 'set-field') return
    const hop = chain.hops.find((h) => h.id === remedy.hopId)
    const patch = hop ? applyRemedy(hop, remedy) : null
    if (!hop || !patch) return
    remember(`Set ${hop.name} · ${remedy.field} to ${remedy.toValue}.`)
    dispatch({ type: 'updateHop', id: hop.id, patch })
    setHighlight(EMPTY)
  }

  const nextNumericId = useMemo(
    () => 1 + Math.max(0, ...chain.hops.map((h) => Number(/^h(\d+)$/.exec(h.id)?.[1] ?? 0))),
    [chain.hops],
  )

  // The intro describes the example only while the example is what is shown.
  const isExample = useMemo(() => encodeChain(chain) === encodeChain(defaultsOnlyChain()), [chain])

  const permalink = () => permalinkFor(chain)
  const report = () => buildReport(analysis, permalinkFor(chain))

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-accent-solid focus:px-3 focus:py-2 focus:text-accent-ink"
      >
        Skip to the analysis
      </a>
      <Header permalink={permalink} report={report} theme={theme.pref} onCycleTheme={theme.cycle} />

      <main id="main" className="mx-auto max-w-[88rem] px-4 pt-6 pb-16 sm:px-6 lg:px-8 lg:pt-8">
        {linkError ? (
          <div role="alert" className="mb-5 flex items-start gap-3 rounded-lg border border-danger-edge bg-danger-wash px-4 py-3 text-sm">
            <CircleAlert size={17} className="mt-0.5 shrink-0 text-danger" aria-hidden />
            <p className="flex-1 text-ink">
              <span className="font-medium">That link could not be opened: </span>
              {linkError}. Showing the defaults-only example instead.
            </p>
            <Button variant="ghost" size="sm" iconOnly aria-label="Dismiss" icon={<X size={14} />} onClick={dismissLinkError} />
          </div>
        ) : null}

        <div className="mb-7">
          <p className="max-w-5xl text-3xl leading-[1.12] font-semibold tracking-tight text-balance text-ink sm:text-4xl">
            The retries you never configured, multiplied out.
          </p>
          <p className="mt-3 max-w-3xl text-base leading-relaxed text-pretty text-ink-dim">
            {isExample
              ? 'Below is a request path on which nobody has written a single retry setting — an ingress, two Istio services and an AWS SDK call, each on its vendor’s documented defaults. Change any layer, or import your own config.'
              : openedFromLink
                ? 'A shared analysis. Every figure here is recomputed in your browser from the path in the link.'
                : 'Every figure here is computed in your browser from the path you have described. Vendor defaults stay cited until you override them.'}
          </p>
        </div>

        <Verdict analysis={analysis} onFailureClass={(id) => dispatch({ type: 'failureClass', id })} />

        <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(21rem,25rem)_minmax(0,1fr)] xl:gap-8">
          <aside className="min-w-0 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:overscroll-contain lg:pr-1 lg:pb-2">
            <PathEditor
              analysis={analysis}
              highlight={highlight}
              onInsertAt={setPickerAt}
              onChange={(id, patch) => dispatch({ type: 'updateHop', id, patch })}
              onMove={(id, by) => dispatch({ type: 'moveHop', id, by })}
              onRemove={(id) => {
                const hop = chain.hops.find((h) => h.id === id)
                remember(`Removed ${hop?.name ?? 'layer'}.`)
                dispatch({ type: 'removeHop', id })
              }}
              onImport={() => setImporting(true)}
              onReset={() => {
                remember('Reset to the defaults-only example.')
                dispatch({ type: 'replace', chain: defaultsOnlyChain() })
              }}
            />
          </aside>

          <div className="grid min-w-0 grid-cols-1 gap-6">
            <FanoutDiagram analysis={analysis} highlight={highlight} />
            <Findings analysis={analysis} onHighlight={onHighlight} onApply={onApply} />
            <DeadlineWaterfall analysis={analysis} highlight={highlight} />
            <AmplificationCurve analysis={analysis} />
            <BudgetTranslator analysis={analysis} onLoad={(field, value) => dispatch({ type: 'load', field, value })} />
          </div>
        </div>

        <div className="mt-16">
          <MethodNotes />
        </div>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[88rem] flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-ink-faint sm:px-6 lg:px-8">
          <span className="flex items-center gap-2">
            <Logo size={18} />
            Stampede runs entirely in your browser. Nothing you enter or paste is sent anywhere.
          </span>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="hover:text-ink">
            Source and issues on GitHub
          </a>
        </div>
      </footer>

      <LayerPicker
        open={pickerAt !== null}
        onClose={() => setPickerAt(null)}
        onPick={(layerId) => {
          dispatch({ type: 'insertHop', layerId, at: pickerAt ?? chain.hops.length })
          setPickerAt(null)
        }}
      />
      <ImportDialog
        open={importing}
        onClose={() => setImporting(false)}
        startId={nextNumericId}
        onReplace={(hops) => {
          remember('Replaced the path with the imported config.')
          dispatch({ type: 'replace', chain: { ...chain, hops } })
        }}
        onAppend={(hops) => {
          remember('Added the imported hops.')
          dispatch({ type: 'appendHops', hops })
        }}
      />

      {undo ? (
        <div
          role="status"
          className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-md items-center gap-3 rounded-lg border border-line-strong bg-overlay px-4 py-2.5 text-sm shadow-e3 motion-safe:animate-[rise_200ms_var(--ease-out-quint)]"
        >
          <p className="min-w-0 flex-1 truncate text-ink">{undo.message}</p>
          <Button
            size="sm"
            variant="ghost"
            icon={<Undo2 size={14} aria-hidden />}
            onClick={() => {
              dispatch({ type: 'replace', chain: undo.chain })
              setUndo(null)
            }}
          >
            Undo
          </Button>
        </div>
      ) : null}
    </div>
  )
}
