import { SCHEMA_VERSION } from './hops'
import type {
  Backoff,
  BackoffKind,
  BudgetKind,
  Chain,
  FailureClassId,
  FieldValue,
  Hop,
  JitterKind,
  RetryBudget,
} from './model'
import { FAILURE_CLASSES } from './registry/failureClasses'

/**
 * The chain round-trips through the URL hash so a finding can be linked from a
 * PR or a postmortem and reopened exactly as it was.
 *
 * Two properties matter more than compactness:
 *  - Deterministic: the same chain always yields the same string, byte for
 *    byte, so links can be compared and deduplicated.
 *  - Strict: a link from a different schema version, or one that fails any
 *    shape check, is refused with a reason rather than decoded into something
 *    subtly different. A permalink that silently changes meaning is worse than
 *    one that breaks.
 *
 * Inherited values are stored with their value *and* citation id, so a link
 * keeps meaning what it meant even if a registry default is later revised.
 */

type Enc = unknown

const encField = <T>(f: FieldValue<T>, enc: (v: T) => Enc): Enc =>
  f.state === 'unknown' ? 0 : f.state === 'declared' ? [1, enc(f.value)] : [2, enc(f.value), f.citationId]

const encBackoff = (b: Backoff): Enc => [b.kind, b.baseMs, b.multiplier, b.capMs, b.jitter]

const encBudget = (b: RetryBudget | null): Enc =>
  b === null ? null : [b.kind, b.value, b.floor ?? null, b.windowSec ?? null]

const id = <T>(v: T): Enc => v

function encHop(h: Hop): Enc {
  return [
    h.id,
    h.name,
    h.layerKindId,
    encField(h.totalTries, id),
    encField(h.timeoutMs, id),
    encField(h.perTryTimeoutMs, id),
    h.timeoutScope === 'includes-retries' ? 'r' : 'a',
    encField(h.backoff, encBackoff),
    encField(h.budget, encBudget),
    encField(h.idempotent, id),
    encField(h.retryOn, id),
    h.disabledReason ?? null,
  ]
}

export function encodeChain(c: Chain): string {
  const payload = {
    v: c.schemaVersion,
    f: c.failureClass,
    h: c.hops.map(encHop),
    r: encField(c.rps, id),
    l: encField(c.meanLatencyMs, id),
    e: encField(c.errorRate, id),
  }
  return toBase64Url(JSON.stringify(payload))
}

// ---- decoding ------------------------------------------------------------------

class Refused extends Error {}

const fail = (why: string): never => {
  throw new Refused(why)
}

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const isStr = (x: unknown): x is string => typeof x === 'string'

function decField<T>(raw: unknown, dec: (v: unknown) => T, what: string): FieldValue<T> {
  if (raw === 0) return { state: 'unknown' }
  if (!Array.isArray(raw)) return fail(`${what}: malformed field`)
  if (raw[0] === 1 && raw.length === 2) return { state: 'declared', value: dec(raw[1]) }
  if (raw[0] === 2 && raw.length === 3 && isStr(raw[2])) {
    return { state: 'inherited', value: dec(raw[1]), citationId: raw[2] }
  }
  return fail(`${what}: malformed field`)
}

const decCount = (x: unknown): number =>
  isNum(x) && Number.isInteger(x) && x >= 1 && x <= 100 ? x : fail('tries out of range')

const decDuration = (x: unknown): number | 'none' =>
  x === 'none' ? 'none' : isNum(x) && x >= 0 && x <= 86_400_000 ? x : fail('duration out of range')

const BACKOFF_KINDS: readonly BackoffKind[] = ['none', 'fixed', 'exponential', 'envoy-exponential']
const JITTERS: readonly JitterKind[] = ['none', 'full', 'equal', 'decorrelated']
const BUDGET_KINDS: readonly BudgetKind[] = ['envoy-concurrency-pct', 'rate-ratio', 'gateway-windowed-pct']

function decBackoff(x: unknown): Backoff {
  if (!Array.isArray(x) || x.length !== 5) return fail('backoff malformed')
  const [kind, baseMs, multiplier, capMs, jitter] = x
  if (!BACKOFF_KINDS.includes(kind)) return fail('unknown backoff kind')
  if (!JITTERS.includes(jitter)) return fail('unknown jitter kind')
  if (!isNum(baseMs) || baseMs < 0 || !isNum(multiplier) || multiplier < 1) return fail('backoff out of range')
  return { kind, baseMs, multiplier, capMs: decDuration(capMs), jitter }
}

function decBudget(x: unknown): RetryBudget | null {
  if (x === null) return null
  if (!Array.isArray(x) || x.length !== 4) return fail('budget malformed')
  const [kind, value, floor, windowSec] = x
  if (!BUDGET_KINDS.includes(kind)) return fail('unknown budget kind')
  if (!isNum(value) || value < 0) return fail('budget out of range')
  return {
    kind,
    value,
    ...(isNum(floor) ? { floor } : {}),
    ...(isNum(windowSec) ? { windowSec } : {}),
  }
}

const decBool = (x: unknown): boolean => (typeof x === 'boolean' ? x : fail('expected boolean'))

const decTokens = (x: unknown): string[] =>
  Array.isArray(x) && x.length <= 32 && x.every(isStr) ? x : fail('retryOn malformed')

const decRatio = (x: unknown): number => (isNum(x) && x >= 0 && x <= 1 ? x : fail('ratio out of range'))
const decPositive = (x: unknown): number => (isNum(x) && x >= 0 ? x : fail('value out of range'))

function decHop(x: unknown): Hop {
  if (!Array.isArray(x) || x.length !== 12) return fail('hop malformed')
  const [hid, name, layer, tries, timeout, perTry, scope, backoff, budget, idem, retryOn, reason] = x
  if (!isStr(hid) || !/^[\w-]{1,24}$/.test(hid)) return fail('hop id malformed')
  if (!isStr(name) || name.length > 80) return fail('hop name malformed')
  if (layer !== null && !isStr(layer)) return fail('layer malformed')
  if (scope !== 'r' && scope !== 'a') return fail('timeout scope malformed')
  return {
    id: hid,
    name,
    layerKindId: layer,
    totalTries: decField(tries, decCount, 'tries'),
    timeoutMs: decField(timeout, decDuration, 'timeout'),
    perTryTimeoutMs: decField(perTry, decDuration, 'per-try timeout'),
    timeoutScope: scope === 'r' ? 'includes-retries' : 'per-attempt',
    backoff: decField(backoff, decBackoff, 'backoff'),
    budget: decField(budget, decBudget, 'budget'),
    idempotent: decField(idem, decBool, 'idempotent'),
    retryOn: decField(retryOn, decTokens, 'retryOn'),
    ...(isStr(reason) ? { disabledReason: reason } : {}),
  }
}

export type DecodeResult = { ok: true; chain: Chain } | { ok: false; reason: string }

export function decodeChain(encoded: string): DecodeResult {
  try {
    const raw: unknown = JSON.parse(fromBase64Url(encoded))
    if (typeof raw !== 'object' || raw === null) return fail('not an object')
    const o = raw as Record<string, unknown>
    if (o.v !== SCHEMA_VERSION) {
      return fail(`this link was made with schema version ${String(o.v)}; this version of the tool reads version ${SCHEMA_VERSION}`)
    }
    if (!FAILURE_CLASSES.some((c) => c.id === o.f)) return fail('unknown failure class')
    if (!Array.isArray(o.h) || o.h.length > 16) return fail('hops malformed')
    const hops = o.h.map(decHop)
    if (new Set(hops.map((h) => h.id)).size !== hops.length) return fail('duplicate hop ids')
    return {
      ok: true,
      chain: {
        schemaVersion: SCHEMA_VERSION,
        failureClass: o.f as FailureClassId,
        hops,
        rps: decField(o.r, decPositive, 'rps'),
        meanLatencyMs: decField(o.l, decPositive, 'latency'),
        errorRate: decField(o.e, decRatio, 'error rate'),
      },
    }
  } catch (e) {
    return { ok: false, reason: e instanceof Refused ? e.message : 'the link is not a valid chain' }
  }
}

// ---- base64url over UTF-8 ------------------------------------------------------

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): string {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Refused('the link contains characters a chain never does')
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}
