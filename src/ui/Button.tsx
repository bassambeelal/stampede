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
  sm: 'h-7 px-2.5 text-xs gap-1.5 rounded-sm',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-md',
  lg: 'h-11 px-5 text-base gap-2 rounded-md',
}

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
        'motion-safe:active:translate-y-px',
        SIZE[size],
        VARIANT[variant],
        iconOnly && (size === 'sm' ? 'w-7 px-0' : size === 'md' ? 'w-9 px-0' : 'w-11 px-0'),
        className,
      )}
      {...rest}
    >
      {icon}
      {!iconOnly && children}
    </button>
  )
}
