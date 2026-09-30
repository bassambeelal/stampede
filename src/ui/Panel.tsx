import type { ReactNode } from 'react'
import { cx } from './cx'

export interface PanelProps {
  children: ReactNode
  className?: string
  /** Removes the internal padding so the panel can hold a flush table or editor. */
  flush?: boolean
}

/** A raised, bordered surface. The default container for anything substantial. */
export function Panel({ children, className, flush = false }: PanelProps) {
  return (
    <section
      className={cx(
        'lip overflow-hidden rounded-lg border border-line bg-surface shadow-e2',
        !flush && 'p-4 sm:p-5',
        className,
      )}
    >
      {children}
    </section>
  )
}

export interface PanelHeaderProps {
  title: ReactNode
  /** Short supporting line. Keep it to one clause. */
  hint?: ReactNode
  /** Controls pinned to the trailing edge. */
  actions?: ReactNode
  className?: string
}

export function PanelHeader({
  title,
  hint,
  actions,
  className,
}: PanelHeaderProps) {
  return (
    <header
      className={cx(
        'flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-2.5 sm:px-5',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold text-ink">{title}</h2>
        {hint ? (
          <p className="mt-0.5 truncate text-xs text-ink-faint">{hint}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </header>
  )
}
