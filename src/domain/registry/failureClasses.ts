import type { FailureClass, FailureClassId } from '../model'

/**
 * The failure the chain is being asked about. Amplification is computed per
 * class because layers disagree about what is worth retrying: Istio's default
 * `retryOn` covers a refused connection but not a plain HTTP 500, so the same
 * mesh amplifies one outage and passes the other straight through.
 *
 * `matchedBy` lists the vendor tokens that cause the class to be retried. Tokens
 * are the vendors' own words (Envoy's `retry_on`, nginx's `proxy_next_upstream`,
 * gRPC status names, the AWS and .NET "transient"/"throttling" categories),
 * lower-cased. `any` is used by libraries that retry every exception.
 */
export const FAILURE_CLASSES: readonly FailureClass[] = [
  {
    id: 'connect-failure',
    label: 'Connection refused',
    note: 'The pod is gone or the port is closed. Nearly every layer retries this one.',
    matchedBy: [
      'connect-failure',
      '5xx',
      'gateway-error',
      'reset',
      'error',
      'connect',
      'transient',
      'any',
    ],
  },
  {
    id: 'http-503',
    label: 'HTTP 503',
    note: 'The overload response. Istio’s default retry policy does not include it.',
    matchedBy: ['5xx', 'gateway-error', 'http_503', '503', 'transient', 'any'],
  },
  {
    id: 'http-500',
    label: 'HTTP 500',
    note: 'Usually a bug rather than load, which is why retrying it multiplies work for nothing.',
    matchedBy: ['5xx', 'http_500', '500', 'transient', 'any'],
  },
  {
    id: 'attempt-timeout',
    label: 'Attempt timed out',
    note: 'The dependency is slow rather than down — the classic brownout.',
    matchedBy: ['5xx', 'gateway-error', 'timeout', 'read', 'transient', 'any'],
  },
  {
    id: 'grpc-unavailable',
    label: 'gRPC UNAVAILABLE',
    note: 'gRPC’s “try again”. Istio retries it by default, including non-idempotent calls.',
    matchedBy: ['unavailable', 'transient', 'any'],
  },
  {
    id: 'http-429',
    label: 'HTTP 429',
    note: 'The server asking you to slow down. Retrying it is the one retry that should always back off hard.',
    matchedBy: ['http_429', '429', 'throttling', 'any'],
  },
]

const BY_ID = new Map(FAILURE_CLASSES.map((c) => [c.id, c]))

export function failureClass(id: FailureClassId): FailureClass {
  const c = BY_ID.get(id)
  if (!c) throw new Error(`unknown failure class: ${id}`)
  return c
}

/** Whether a hop configured with `retryOn` would retry this class of failure. */
export function retriesClass(
  retryOn: readonly string[],
  id: FailureClassId,
): boolean {
  const matched = failureClass(id).matchedBy
  return retryOn.some((t) => matched.includes(t.trim().toLowerCase()))
}
