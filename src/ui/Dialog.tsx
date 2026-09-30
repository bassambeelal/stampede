import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Button } from './Button'
import { cx } from './cx'

export interface DialogProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  width?: 'md' | 'lg' | 'xl'
}

const WIDTH = { md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }

/**
 * A modal built on the native <dialog> element, which gives focus trapping,
 * Escape-to-close, inert background and a top-layer backdrop for free. Clicking
 * the backdrop closes it too, since that is what people expect.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 'lg',
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descId = useId()

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        // A click whose target is the dialog element itself landed on the backdrop.
        if (e.target === e.currentTarget) onClose()
      }}
      className={cx(
        'm-auto w-[calc(100%-2rem)] rounded-xl border border-line-strong bg-surface p-0 text-ink shadow-e3',
        'backdrop:bg-[oklch(0.12_0.01_265/0.62)] backdrop:backdrop-blur-[2px]',
        'open:motion-safe:animate-[rise_180ms_var(--ease-out-quint)]',
        WIDTH[width],
      )}
    >
      <div className="flex max-h-[min(88vh,56rem)] flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold tracking-tight">
              {title}
            </h2>
            {description ? (
              <p id={descId} className="mt-1 text-sm text-ink-dim">
                {description}
              </p>
            ) : null}
          </div>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label="Close"
            icon={<X size={16} />}
            onClick={onClose}
          />
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-canvas/40 px-5 py-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </dialog>
  )
}
