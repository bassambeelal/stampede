import {
  cloneElement,
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

export interface TooltipProps {
  content: ReactNode
  /** A single focusable element. Receives `aria-describedby` and the handlers. */
  children: ReactElement<Record<string, unknown>>
  side?: 'top' | 'bottom'
  /** Max width in px. Long explanations need room; short labels should not get it. */
  width?: number
}

const GAP = 8

/**
 * Hover/focus tooltip rendered into a portal so it is never clipped by a
 * scroll container, and flipped to the other side when it would leave the
 * viewport. Opens on focus as well as hover so it is reachable by keyboard.
 */
export function Tooltip({
  content,
  children,
  side = 'top',
  width = 260,
}: TooltipProps) {
  const id = useId()
  const anchor = useRef<HTMLElement | null>(null)
  const bubble = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; flipped: boolean }>(
    { top: 0, left: 0, flipped: false },
  )

  const place = useCallback(() => {
    const a = anchor.current?.getBoundingClientRect()
    const b = bubble.current?.getBoundingClientRect()
    if (!a || !b) return

    const wantsTop = side === 'top'
    const roomAbove = a.top - b.height - GAP > 4
    const roomBelow = a.bottom + b.height + GAP < window.innerHeight - 4
    const onTop = wantsTop ? roomAbove || !roomBelow : !(roomBelow || !roomAbove)

    const left = Math.min(
      Math.max(8, a.left + a.width / 2 - b.width / 2),
      window.innerWidth - b.width - 8,
    )
    const top = onTop ? a.top - b.height - GAP : a.bottom + GAP
    setPos({ top, left, flipped: !onTop })
  }, [side])

  useLayoutEffect(() => {
    if (!open) return
    place()
    // Re-measure while open: a tooltip anchored inside a scrolling table has to
    // follow its anchor or it detaches visually.
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, place])

  const show = () => setOpen(true)
  const hide = () => setOpen(false)

  const trigger = cloneElement(children, {
    ref: anchor,
    'aria-describedby': open ? id : undefined,
    onPointerEnter: show,
    onPointerLeave: hide,
    onFocus: show,
    onBlur: hide,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') hide()
    },
  })

  return (
    <>
      {trigger}
      {open
        ? createPortal(
            <div
              id={id}
              ref={bubble}
              role="tooltip"
              style={{ top: pos.top, left: pos.left, maxWidth: width }}
              className="pointer-events-none fixed z-50 rounded-md border border-line-strong bg-overlay px-2.5 py-1.5 text-xs leading-relaxed text-ink shadow-e3 motion-safe:animate-[tip_120ms_var(--ease-out-quint)]"
            >
              {content}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
