/**
 * Number formatting shared by the rules, the report and the UI, so a value
 * reads identically in a finding card, a tooltip and a pasted PR comment.
 */

/** 250ms, 1.5s, 15s, 2m 30s. `Infinity` reads as "no limit". */
export function fmtMs(ms: number): string {
  if (!Number.isFinite(ms)) return 'no limit'
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) {
    const s = ms / 1000
    return `${Number.isInteger(s) ? s : s.toFixed(s < 10 ? 2 : 1).replace(/0+$/, '').replace(/\.$/, '')}s`
  }
  const m = Math.floor(ms / 60_000)
  const s = Math.round((ms % 60_000) / 1000)
  return s ? `${m}m ${s}s` : `${m}m`
}

/** 27x, 1.03x, 81x. Two decimals below 10, whole numbers above 100. */
export function fmtX(n: number): string {
  if (!Number.isFinite(n)) return '∞x'
  if (n >= 100) return `${Math.round(n)}x`
  if (n >= 10) return `${Number(n.toFixed(1))}x`
  return `${Number(n.toFixed(2))}x`
}

export function fmtPct(ratio: number, digits = 1): string {
  const v = ratio * 100
  return `${Number(v.toFixed(v >= 10 ? 0 : digits))}%`
}

/** "3 calls (1 + 2 retries)". The normalised count is always shown with its split. */
export function fmtTries(total: number): string {
  if (total <= 1) return '1 call, no retries'
  const r = total - 1
  return `${total} calls (1 + ${r} ${r === 1 ? 'retry' : 'retries'})`
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

/** Joins names as "A", "A and B", "A, B and C". */
export function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}
