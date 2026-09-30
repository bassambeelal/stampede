import {
  declared,
  inherited,
  unknown,
  type Chain,
  type FieldValue,
  type Hop,
  type LayerDefault,
  type LayerKind,
} from './model'
import { layerKind } from './registry/layers'

export const SCHEMA_VERSION = 1

function fromDefault<T>(d: LayerDefault<T> | undefined): FieldValue<T> {
  return d ? inherited(d.value, d.citationId) : unknown<T>()
}

/**
 * A hop pre-filled with a layer's documented defaults. Every field the layer
 * documents arrives INHERITED with its citation; every field it does not
 * document arrives UNKNOWN, never as a guessed default.
 */
export function hopFromLayer(kind: LayerKind, id: string, name?: string): Hop {
  const d = kind.defaults
  return {
    id,
    name: name ?? kind.label,
    layerKindId: kind.id,
    totalTries: fromDefault(d.totalTries),
    timeoutMs: fromDefault(d.timeoutMs),
    perTryTimeoutMs: fromDefault(d.perTryTimeoutMs),
    timeoutScope: kind.timeoutScope.value,
    backoff: fromDefault(d.backoff),
    budget: fromDefault(d.budget),
    idempotent: fromDefault(d.idempotent),
    retryOn: fromDefault(d.retryOn),
  }
}

/**
 * A hand-entered hop for a layer the registry does not know about. It starts
 * with only a single attempt declared — every other field is UNKNOWN until the
 * user says otherwise, so an unfinished hop can never quietly read as safe.
 */
export function genericHop(id: string, name = 'Custom hop'): Hop {
  return {
    id,
    name,
    layerKindId: null,
    totalTries: declared(1),
    timeoutMs: unknown(),
    perTryTimeoutMs: unknown(),
    timeoutScope: 'includes-retries',
    backoff: unknown(),
    budget: unknown(),
    idempotent: unknown(),
    retryOn: unknown(),
  }
}

export function hopFromLayerId(layerId: string, id: string, name?: string): Hop {
  const kind = layerKind(layerId)
  return kind ? hopFromLayer(kind, id, name) : genericHop(id, name)
}

/** Resets one field of a hop back to what its layer documents. */
export function inheritedValue<K extends keyof LayerKind['defaults']>(
  hop: Hop,
  field: K,
): FieldValue<NonNullable<LayerKind['defaults'][K]>['value']> | null {
  const kind = hop.layerKindId ? layerKind(hop.layerKindId) : undefined
  const d = kind?.defaults[field]
  return d ? inherited(d.value, d.citationId) : null
}

/** A small, stable id that survives the URL round trip. */
export function nextHopId(chain: Pick<Chain, 'hops'>): string {
  let n = chain.hops.length + 1
  const taken = new Set(chain.hops.map((h) => h.id))
  while (taken.has(`h${n}`)) n++
  return `h${n}`
}

export function emptyChain(): Chain {
  return {
    schemaVersion: SCHEMA_VERSION,
    hops: [],
    failureClass: 'attempt-timeout',
    rps: unknown(),
    meanLatencyMs: unknown(),
    errorRate: unknown(),
  }
}

/**
 * The first thing a visitor sees. Not sample data: this is the literal
 * configuration of a team that has written no retry settings at all — an
 * ingress, two meshed services and an SDK call, each on vendor defaults — and
 * every number the tool shows for it comes from the cited defaults.
 */
export function defaultsOnlyChain(): Chain {
  return {
    ...emptyChain(),
    failureClass: 'connect-failure',
    hops: [
      hopFromLayerId('ingress-nginx', 'h1', 'Ingress'),
      hopFromLayerId('istio-sidecar', 'h2', 'API service sidecar'),
      hopFromLayerId('istio-sidecar', 'h3', 'Orders service sidecar'),
      hopFromLayerId('aws-sdk', 'h4', 'S3 call'),
    ],
  }
}
