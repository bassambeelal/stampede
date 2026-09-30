import type { ReactNode } from 'react'
import { cx } from './cx'

export type Tone = 'neutral' | 'accent' | 'safe' | 'caution' | 'danger' | 'critical'

const TONE: Record<Tone, string> = {
  neutral: 'bg-raised text-ink-dim border-line',
  accent: 'bg-accent-wash text-accent border-accent-edge',
  safe: 'bg-safe-wash text-safe border-safe-edge',
  caution: 'bg-caution-wash text-caution border-caution-edge',
  danger: 'bg-danger-wash text-danger border-danger-edge',
  critical: 'bg-critical-wash text-critical border-critical-edge',
}

const SOLID: Record<Tone, string> = {
  neutral: 'bg-line-strong text-ink border-transparent',
  accent: 'bg-accent-solid text-accent-ink border-transparent',
  safe: 'bg-safe-solid text-safe-ink border-transparent',
  caution: 'bg-caution-solid text-caution-ink border-transparent',
  danger: 'bg-danger-solid text-danger-ink border-transparent',
  critical: 'bg-critical-solid text-critical-ink border-transparent',
}

export interface BadgeProps {
  tone?: Tone
  solid?: boolean
  /**
   * A shape drawn alongside the label. Severity is never communicated by hue
   * alone — the label carries it too, and an icon gives a third channel.
   */
  icon?: ReactNode
  children: ReactNode
  className?: string
  title?: string
}

export function Badge({
  tone = 'neutral',
  solid = false,
  icon,
  children,
  className,
  title,
}: BadgeProps) {
  return (
    <span
      title={title}
      className={cx(
        'inline-flex shrink-0 items-center gap-1 rounded-sm border px-1.5 py-0.5',
        'text-micro font-semibold uppercase',
        solid ? SOLID[tone] : TONE[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  )
}
