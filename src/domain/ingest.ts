import { parseAllDocuments } from 'yaml'
import { hopFromLayerId } from './hops'
import { declared, inherited, type Backoff, type Duration, type Hop } from './model'

/**
 * Reads the retry and timeout settings out of pasted Istio or Envoy config.
 *
 * This is deliberately narrow. It maps the handful of keys that determine retry
 * and deadline behaviour and reports every other key it finds under a retry
 * policy as "not modeled", instead of dropping it silently. It does not validate
 * the config as a whole — that is istioctl analyze's job.
 *
 * Fields the config does not set stay INHERITED from the layer defaults, which
 * is the point: a VirtualService that sets only `timeout` still carries Istio's
 * default retries, and the tool should keep saying so.
 */

export interface IngestResult {
  readonly source: 'Istio VirtualService' | 'Envoy route'
  readonly hops: readonly Hop[]
  /** Dotted paths of keys under retry/timeout config that the tool does not model. */
  readonly notModeled: readonly string[]
  readonly notes: readonly string[]
}

export type IngestOutcome = { ok: true; results: IngestResult[] } | { ok: false; reason: string }

type Obj = Record<string, unknown>
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x)

/**
 * Parses a duration as Istio and Envoy write them: "1.5s", "250ms", "1m",
 * "1h", protobuf-JSON {seconds, nanos}. Zero means "disabled" in both, which is
 * returned as 'none'. Returns null for anything unrecognised.
 */
export function parseDuration(x: unknown): Duration | null {
  if (isObj(x)) {
    const s = Number(x.seconds ?? 0)
    const n = Number(x.nanos ?? 0)
    if (!Number.isFinite(s) || !Number.isFinite(n)) return null
    const ms = s * 1000 + n / 1e6
    return ms === 0 ? 'none' : Math.round(ms)
  }
  if (typeof x !== 'string') return null
  const m = /^\s*(\d+(?:\.\d+)?)\s*(ms|s|m|h)\s*$/.exec(x)
  if (!m) return null
  const v = Number(m[1])
  const scale = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 }[m[2] as 'ms' | 's' | 'm' | 'h']
  const ms = Math.round(v * scale)
  return ms === 0 ? 'none' : ms
}

const splitTokens = (x: unknown): string[] | null =>
  typeof x === 'string'
    ? x.split(',').map((t) => t.trim()).filter(Boolean)
    : Array.isArray(x) && x.every((t) => typeof t === 'string')
      ? (x as string[])
      : null

function unknownKeys(o: Obj, known: readonly string[], prefix: string): string[] {
  return Object.keys(o)
    .filter((k) => !known.includes(k))
    .map((k) => `${prefix}.${k}`)
}

// ---- Istio -------------------------------------------------------------------

const ISTIO_RETRY_KEYS = ['attempts', 'perTryTimeout', 'retryOn'] as const

function routeLabel(route: Obj, i: number): string {
  if (typeof route.name === 'string' && route.name) return route.name
  const match = Array.isArray(route.match) ? route.match[0] : undefined
  const uri = isObj(match) && isObj(match.uri) ? Object.values(match.uri)[0] : undefined
  return typeof uri === 'string' ? uri : `route ${i + 1}`
}

function ingestVirtualService(doc: Obj, nextId: () => string): IngestResult {
  const spec = isObj(doc.spec) ? doc.spec : {}
  const meta = isObj(doc.metadata) ? doc.metadata : {}
  const vsName = typeof meta.name === 'string' ? meta.name : 'virtualservice'
  const http = Array.isArray(spec.http) ? spec.http.filter(isObj) : []
  const notModeled: string[] = []
  const notes: string[] = []

  const hops = http.map((route, i) => {
    const label = http.length > 1 ? `${vsName} / ${routeLabel(route, i)}` : vsName
    let hop = hopFromLayerId('istio-sidecar', nextId(), label)
    const path = `http[${i}]`

    if ('timeout' in route) {
      const t = parseDuration(route.timeout)
      if (t === null) notes.push(`${path}.timeout: could not read "${String(route.timeout)}"`)
      else hop = { ...hop, timeoutMs: declared(t) }
    }

    if (isObj(route.retries)) {
      const r = route.retries
      notModeled.push(...unknownKeys(r, ISTIO_RETRY_KEYS, `${path}.retries`))
      if ('attempts' in r) {
        const n = Number(r.attempts)
        // Istio's `attempts` counts retries: the total is 1 + attempts.
        if (Number.isInteger(n) && n >= 0) hop = { ...hop, totalTries: declared(n + 1) }
        else notes.push(`${path}.retries.attempts: could not read "${String(r.attempts)}"`)
      }
      if ('perTryTimeout' in r) {
        const t = parseDuration(r.perTryTimeout)
        if (t === null) notes.push(`${path}.retries.perTryTimeout: could not read "${String(r.perTryTimeout)}"`)
        else hop = { ...hop, perTryTimeoutMs: declared(t) }
      }
      if ('retryOn' in r) {
        const tokens = splitTokens(r.retryOn)
        if (tokens) hop = { ...hop, retryOn: declared(tokens) }
      }
    } else {
      notes.push(`${label}: no retries block, so Istio’s default retry policy applies.`)
    }
    return hop
  })

  if (http.length === 0) notes.push(`${vsName}: no http routes found.`)
  return { source: 'Istio VirtualService', hops, notModeled, notes }
}

// ---- Envoy -------------------------------------------------------------------

const ENVOY_RETRY_KEYS = ['retry_on', 'num_retries', 'per_try_timeout', 'retry_back_off'] as const

/** A RouteAction is the object that names an upstream cluster. */
const isRouteAction = (o: Obj) =>
  'cluster' in o || 'cluster_header' in o || 'weighted_clusters' in o || 'cluster_specifier_plugin' in o

function findRouteActions(x: unknown, path: string, out: { action: Obj; path: string; name?: string }[], name?: string) {
  if (Array.isArray(x)) {
    x.forEach((v, i) => findRouteActions(v, `${path}[${i}]`, out, name))
    return
  }
  if (!isObj(x)) return
  const here = typeof x.name === 'string' ? x.name : name
  if (isObj(x.route) && isRouteAction(x.route)) {
    out.push({ action: x.route, path: `${path}.route`, name: here })
    return
  }
  for (const [k, v] of Object.entries(x)) findRouteActions(v, path ? `${path}.${k}` : k, out, here)
}

function ingestEnvoy(doc: Obj, nextId: () => string): IngestResult {
  const found: { action: Obj; path: string; name?: string }[] = []
  findRouteActions(doc, '', found)
  const notModeled: string[] = []
  const notes: string[] = []

  const hops = found.map(({ action, path, name }, i) => {
    const cluster = typeof action.cluster === 'string' ? action.cluster : undefined
    const label = name ?? cluster ?? `Envoy route ${i + 1}`
    let hop = hopFromLayerId('envoy-route', nextId(), label)

    if ('timeout' in action) {
      const t = parseDuration(action.timeout)
      if (t === null) notes.push(`${path}.timeout: could not read "${String(action.timeout)}"`)
      else hop = { ...hop, timeoutMs: declared(t) }
    }

    const rp = action.retry_policy
    if (isObj(rp)) {
      notModeled.push(...unknownKeys(rp, ENVOY_RETRY_KEYS, `${path}.retry_policy`))
      const n = Number(rp.num_retries)
      hop = {
        ...hop,
        // A retry policy without num_retries is documented to mean one retry.
        totalTries:
          'num_retries' in rp && Number.isInteger(n) && n >= 0
            ? declared(n + 1)
            : inherited(2, 'envoy-num-retries'),
      }
      const tokens = splitTokens(rp.retry_on)
      if (tokens) hop = { ...hop, retryOn: declared(tokens) }
      if ('per_try_timeout' in rp) {
        const t = parseDuration(rp.per_try_timeout)
        if (t !== null) hop = { ...hop, perTryTimeoutMs: declared(t) }
      }
      if (isObj(rp.retry_back_off)) {
        const base = parseDuration(rp.retry_back_off.base_interval)
        const max = parseDuration(rp.retry_back_off.max_interval)
        if (typeof base === 'number') {
          const backoff: Backoff = {
            kind: 'envoy-exponential',
            baseMs: base,
            multiplier: 2,
            // Envoy defaults the cap to ten times the base when it is not given.
            capMs: typeof max === 'number' ? max : base * 10,
            jitter: 'full',
          }
          hop = { ...hop, backoff: declared(backoff) }
        }
      }
    }
    return hop
  })

  if (JSON.stringify(doc).includes('retry_budget')) {
    notes.push('A cluster retry_budget was found. Budgets live on clusters, not routes — set it on the matching hop by hand.')
  }
  if (found.length === 0) notes.push('No Envoy route actions (objects naming a cluster) were found.')
  return { source: 'Envoy route', hops, notModeled, notes }
}

// ---- entry point -------------------------------------------------------------

export function ingestConfig(text: string, startId: number): IngestOutcome {
  if (!text.trim()) return { ok: false, reason: 'Paste an Istio VirtualService or an Envoy route configuration.' }
  let docs: unknown[]
  try {
    const parsed = parseAllDocuments(text)
    const errs = parsed.flatMap((d) => d.errors)
    if (errs.length) return { ok: false, reason: `Could not parse: ${errs[0]!.message.split('\n')[0]}` }
    docs = parsed.map((d) => d.toJS()).filter((d) => d !== null && d !== undefined)
  } catch (e) {
    return { ok: false, reason: `Could not parse: ${(e as Error).message}` }
  }

  let n = startId
  const nextId = () => `h${n++}`
  const results: IngestResult[] = []
  for (const doc of docs) {
    if (!isObj(doc)) continue
    if (doc.kind === 'VirtualService') results.push(ingestVirtualService(doc, nextId))
    else {
      const r = ingestEnvoy(doc, nextId)
      if (r.hops.length) results.push(r)
    }
  }
  if (!results.length || results.every((r) => r.hops.length === 0)) {
    return {
      ok: false,
      reason:
        'Found no Istio VirtualService http routes and no Envoy route actions. Only retry and timeout settings from those two are read.',
    }
  }
  return { ok: true, results }
}
