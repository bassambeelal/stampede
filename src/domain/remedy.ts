import { declared, NO_BACKOFF, type Hop, type Remedy } from './model'

/**
 * Turns a cited, mechanically determined remedy into a change to the hop, so a
 * fix can be tried and its effect on every number seen immediately. Returns
 * null for remedies that are statements of a constraint: those need a human
 * decision the tool cannot make.
 */
export function applyRemedy(hop: Hop, remedy: Remedy): Partial<Hop> | null {
  if (remedy.kind !== 'set-field') return null
  const current = hop.backoff.state === 'unknown' ? NO_BACKOFF : hop.backoff.value
  switch (remedy.field) {
    case 'perTryTimeoutMs':
      return typeof remedy.raw === 'number' ? { perTryTimeoutMs: declared(remedy.raw) } : null
    case 'totalTries':
      return typeof remedy.raw === 'number' ? { totalTries: declared(remedy.raw) } : null
    case 'backoff':
      return remedy.raw === 'aws-standard'
        ? {
            backoff: declared({
              kind: 'exponential',
              baseMs: 50,
              multiplier: 2,
              capMs: 20_000,
              jitter: 'full',
            }),
          }
        : null
    case 'backoff.jitter':
      return remedy.raw === 'full' ? { backoff: declared({ ...current, jitter: 'full' }) } : null
  }
}
