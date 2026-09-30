import type { Severity } from '../domain/model'
import type { Tone } from '../ui/Badge'

export const SEVERITY_TONE: Record<Severity, Tone> = {
  critical: 'critical',
  danger: 'danger',
  caution: 'caution',
  info: 'neutral',
}

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Critical',
  danger: 'Danger',
  caution: 'Caution',
  info: 'Info',
}

/**
 * Colour for an amplification figure. The bands are presentational, anchored to
 * the one published per-request figure there is: up to 3 calls is within a
 * single SRE per-request budget; beyond one layer’s budget it is a problem;
 * beyond two layers’ worth it is a storm.
 */
export function amplificationTone(x: number): Tone {
  if (x <= 1) return 'safe'
  if (x <= 3) return 'caution'
  if (x <= 9) return 'danger'
  return 'critical'
}

export const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-ink',
  accent: 'text-accent',
  safe: 'text-safe',
  caution: 'text-caution',
  danger: 'text-danger',
  critical: 'text-critical',
}

export const TONE_BG: Record<Tone, string> = {
  neutral: 'bg-line-strong',
  accent: 'bg-accent',
  safe: 'bg-safe',
  caution: 'bg-caution',
  danger: 'bg-danger',
  critical: 'bg-critical',
}

export const TONE_FILL: Record<Tone, string> = {
  neutral: 'fill-ink-faint',
  accent: 'fill-accent',
  safe: 'fill-safe',
  caution: 'fill-caution',
  danger: 'fill-danger',
  critical: 'fill-critical',
}
