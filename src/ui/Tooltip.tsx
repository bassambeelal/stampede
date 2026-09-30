import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

/** Props the trigger must spread onto its focusable element. */
export interface TooltipTriggerProps {
  'aria-describedby': string | undefined
  onPointerEnter: (e: PointerEvent<HTMLElement>) => void
  onPointerLeave: () => void
  onFocus: (e: FocusEvent<HTMLElement>) => void
  onBlur: () => void
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void
}

export interface TooltipProps {
  content: ReactNode
  /**
   * Renders the trigger. Taking props explicitly, rather than cloning a child,
   * keeps the wiring visible at the call site and puts `aria-describedby` on
   * the element that actually receives focus.
   */
  children: (trigger: TooltipTriggerProps) => ReactElement
  side?: 'top' | 'bottom'
  /** Max width in px. Long explanations need room; short labels should not get it. */
  width?: number
}

const GAP = 8
const OFFSCREEN = { top: -9999, left: -9999 }

/**
 * Hover/focus tooltip rendered into a portal so it is never clipped by a
 * scroll container, and flipped to the other side when it would leave the
 * viewport. Opens on focus as well as hover so it is reachable by keyboard.
 *
 * The anchor is taken from the event that opened the tooltip, so no ref has to
 * be threaded through the trigger.
 */
export function Tooltip({ content, children, side = 'top', width = 260 }: TooltipProps) {
  const id = useId()
  const bubble = useRef<HTMLDivElement | null>(null)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [pos, setPos] = useState(OFFSCREEN)

  const place = useCallback(() => {
    const a = anchor?.getBoundingClientRect()
    const b = bubble.current?.getBoundingClientRect()
    if (!a || !b) return

    const roomAbove = a.top - b.height - GAP > 4
    const roomBelow = a.bottom + b.height + GAP < window.innerHeight - 4
    const onTop = side === 'top' ? roomAbove || !roomBelow : !(roomBelow || !roomAbove)

    setPos({
      top: onTop ? a.top - b.height - GAP : a.bottom + GAP,
      left: Math.min(Math.max(8, a.left + a.width / 2 - b.width / 2), window.innerWidth - b.width - 8),
    })
  }, [anchor, side])

  useLayoutEffect(() => {
    if (!anchor) return
    place()
    // Follow the anchor while open: one inside a scrolling panel would
    // otherwise detach visually.
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [anchor, place])

  const hide = () => {
    setAnchor(null)
    setPos(OFFSCREEN)
  }

  const trigger = children({
    'aria-describedby': anchor ? id : undefined,
    onPointerEnter: (e) => setAnchor(e.currentTarget),
    onPointerLeave: hide,
    onFocus: (e) => setAnchor(e.currentTarget),
    onBlur: hide,
    onKeyDown: (e) => {
      if (e.key === 'Escape') hide()
    },
  })

  return (
    <>
      {trigger}
      {anchor
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
