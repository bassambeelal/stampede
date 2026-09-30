import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from './cx'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const VARIANT: Record<Variant, string> = {
  primary:
    'bg-accent-solid text-accent-ink shadow-e1 hover:brightness-110 active:brightness-95',
  secondary:
    'bg-raised text-ink border border-line hover:border-line-strong hover:bg-overlay active:brightness-95',
  ghost:
    'text-ink-dim hover:text-ink hover:bg-raised active:bg-overlay border border-transparent',
  danger:
    'bg-critical-solid text-critical-ink shadow-e1 hover:brightness-110 active:brightness-95',
}

const SIZE: Record<Size, string> = {
  sm: 'h-7 text-xs gap-1.5 rounded-sm',
  md: 'h-9 text-sm gap-2 rounded-md',
  lg: 'h-11 text-base gap-2 rounded-md',
}

// Padding and square sizing are separate maps so an icon-only button never
// carries both: two conflicting padding utilities resolve by stylesheet order,
// not by class order, and the loser silently squeezes the icon.
const PAD: Record<Size, string> = { sm: 'px-2.5', md: 'px-3.5', lg: 'px-5' }
const SQUARE: Record<Size, string> = { sm: 'w-7', md: 'w-9', lg: 'w-11' }

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  /** Rendered before the label, sized to match the text. */
  icon?: ReactNode
  /** Square button with no label — `aria-label` becomes required in practice. */
  iconOnly?: boolean
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconOnly = false,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap',
        'transition-[background-color,border-color,color,filter,box-shadow] duration-150',
        'disabled:pointer-events-none disabled:opacity-45',
        'motion-safe:active:translate-y-px [&_svg]:shrink-0',
        SIZE[size],
        iconOnly ? SQUARE[size] : PAD[size],
        VARIANT[variant],
        className,
      )}
      {...rest}
    >
      {icon}
      {!iconOnly && children}
    </button>
  )
}
