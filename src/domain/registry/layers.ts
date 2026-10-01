import type { LayerKind } from '../model'

/**
 * Layers the user can drop into a request path. Choosing one instantiates a hop
 * whose fields are INHERITED from the defaults below, each backed by a verbatim
 * citation. A field with no entry here starts as UNKNOWN: if we cannot cite a
 * default, we do not pretend to know it.
 *
 * `totalTries` is always normalised to total calls including the first. The
 * vendors' own conventions are wildly inconsistent — Istio and Envoy count
 * retries, AWS and resilience4j count attempts, Polly and .NET count retries on
 * top — so the surprise text says which convention the source uses.
 */
export const LAYERS: readonly LayerKind[] = [
  {
    id: 'istio-sidecar',
    product: 'Istio',
    label: 'Istio sidecar',
    tier: 'mesh',
    blurb: 'An Envoy sidecar hop inside an Istio mesh with no retries block in its VirtualService.',
    timeoutScope: { value: 'includes-retries', citationId: 'envoy-retries-within-timeout' },
    defaults: {
      totalTries: {
        value: 3,
        citationId: 'istio-default-retry-policy',
        appliesWhen: 'The VirtualService has no retries block and meshConfig.defaultHttpRetryPolicy is unset.',
      },
      timeoutMs: { value: 'none', citationId: 'istio-route-timeout' },
      perTryTimeoutMs: { value: 'none', citationId: 'istio-per-try-timeout' },
      backoff: {
        value: { kind: 'envoy-exponential', baseMs: 25, multiplier: 2, capMs: 250, jitter: 'full' },
        citationId: 'envoy-default-backoff',
      },
      retryOn: {
        value: ['connect-failure', 'refused-stream', 'unavailable', 'cancelled'],
        citationId: 'istio-default-retry-policy',
        appliesWhen:
          'Istio’s MeshConfig reference lists a fifth condition, retriable-status-codes, that the VirtualService reference omits. Check the generated config for your version.',
      },
    },
    surprise:
      'Retries are on even if you never configured them: attempts: 2 counts retries, so three calls leave the sidecar — and by default neither the route nor each attempt has a timeout.',
    configKeys: ['http[].retries.attempts', 'http[].retries.perTryTimeout', 'http[].retries.retryOn', 'http[].timeout'],
  },
  {
    id: 'envoy-route',
    product: 'Envoy',
    label: 'Envoy route',
    tier: 'edge',
    blurb: 'A standalone Envoy (edge proxy or gateway) route with no retry policy.',
    timeoutScope: { value: 'includes-retries', citationId: 'envoy-retries-within-timeout' },
    defaults: {
      totalTries: { value: 1, citationId: 'envoy-no-retry-by-default' },
      timeoutMs: { value: 15_000, citationId: 'envoy-route-timeout' },
      backoff: {
        value: { kind: 'envoy-exponential', baseMs: 25, multiplier: 2, capMs: 250, jitter: 'full' },
        citationId: 'envoy-default-backoff',
      },
    },
    surprise:
      'The same data plane as Istio with the opposite default: bare Envoy retries nothing, but cuts every request off at 15s. Add a retry_policy without num_retries and you get exactly one retry.',
    configKeys: ['timeout', 'retry_policy.num_retries', 'retry_policy.per_try_timeout', 'retry_policy.retry_on', 'retry_policy.retry_back_off'],
  },
  {
    id: 'ingress-nginx',
    product: 'ingress-nginx',
    label: 'ingress-nginx',
    tier: 'edge',
    blurb: 'The Kubernetes NGINX ingress controller with its ConfigMap defaults.',
    // proxy_*_timeout values bound each upstream attempt, not the whole
    // sequence of next-upstream tries.
    timeoutScope: { value: 'per-attempt' },
    defaults: {
      totalTries: { value: 3, citationId: 'ingress-nginx-next-upstream-tries' },
      retryOn: { value: ['error', 'timeout'], citationId: 'ingress-nginx-next-upstream' },
      backoff: {
        value: { kind: 'none', baseMs: 0, multiplier: 1, capMs: 'none', jitter: 'none' },
        citationId: 'ingress-nginx-next-upstream',
        appliesWhen: 'proxy-next-upstream passes the request straight to the next server; there is no wait between tries.',
      },
    },
    surprise:
      'Passes a failed or timed-out request to another pod out of the box, up to three tries — before your application’s own retries have even started.',
  },
  {
    id: 'linkerd-proxy',
    product: 'Linkerd',
    label: 'Linkerd proxy',
    tier: 'mesh',
    blurb: 'A Linkerd-meshed hop with no retry annotations.',
    timeoutScope: { value: 'includes-retries' },
    defaults: {
      totalTries: { value: 1, citationId: 'linkerd-opt-in' },
      budget: {
        value: { kind: 'rate-ratio', value: 0.2, floor: 10, windowSec: 10 },
        citationId: 'linkerd-retry-budget',
        appliesWhen: 'Only once retries are enabled on a route.',
      },
    },
    surprise:
      'The only mesh here that retries nothing by default. Opt in and the limit is one retry, with a budget whose 10 free retries per second can triple the load on a quiet service.',
  },
  {
    id: 'aws-sdk',
    product: 'AWS SDKs',
    label: 'AWS SDK (standard mode)',
    tier: 'sdk',
    blurb: 'Any AWS SDK call with the cross-SDK standard retry settings.',
    timeoutScope: { value: 'per-attempt' },
    defaults: {
      totalTries: { value: 3, citationId: 'aws-max-attempts' },
      backoff: {
        value: { kind: 'exponential', baseMs: 50, multiplier: 2, capMs: 20_000, jitter: 'full' },
        citationId: 'aws-backoff-formula',
        appliesWhen: 'Transient errors. Throttling errors use a 1,000 ms base.',
      },
      retryOn: { value: ['transient', 'throttling'], citationId: 'aws-transient-errors' },
    },
    retryLimiter: {
      description: 'A 500-token retry quota per client: once sustained failures drain it, the SDK stops retrying.',
      citationId: 'aws-retry-quota',
    },
    surprise:
      'max_attempts counts the first call, so 3 means two retries. And this documented behaviour is opt-in until AWS_NEW_RETRIES_2026 is set — without it you get each SDK’s legacy behaviour.',
  },
  {
    id: 'boto3',
    product: 'Boto3',
    label: 'Boto3 (legacy mode)',
    tier: 'sdk',
    blurb: 'A Python Boto3 client created with no retry configuration.',
    timeoutScope: { value: 'per-attempt' },
    defaults: {
      totalTries: { value: 5, citationId: 'boto3-legacy-default' },
      retryOn: { value: ['transient', 'throttling'], citationId: 'aws-transient-errors' },
    },
    surprise:
      'Boto3 still defaults to legacy mode: five attempts, not the three the cross-SDK documentation advertises, and no standardised retry quota to stop it during an outage.',
  },
  {
    id: 'grpc-client',
    product: 'gRPC',
    label: 'gRPC client',
    tier: 'sdk',
    blurb: 'A gRPC channel with no service config retry policy and no deadline set.',
    timeoutScope: { value: 'includes-retries' },
    defaults: {
      totalTries: { value: 1, citationId: 'grpc-no-default-policy' },
      timeoutMs: { value: 'none', citationId: 'grpc-no-default-deadline' },
    },
    surprise:
      '“Retries are enabled by default” means the mechanism, not a policy — nothing retries until you write one. And with no deadline set, a call can wait forever.',
  },
  {
    id: 'dotnet-standard-resilience',
    product: '.NET',
    label: '.NET standard resilience handler',
    tier: 'library',
    blurb: 'An HttpClient with AddStandardResilienceHandler() and nothing else.',
    timeoutScope: { value: 'includes-retries', citationId: 'msext-total-timeout' },
    defaults: {
      totalTries: { value: 4, citationId: 'msext-retry' },
      timeoutMs: { value: 30_000, citationId: 'msext-total-timeout' },
      perTryTimeoutMs: { value: 10_000, citationId: 'msext-attempt-timeout' },
      backoff: {
        value: { kind: 'exponential', baseMs: 2000, multiplier: 2, capMs: 'none', jitter: 'full' },
        citationId: 'msext-retry',
        appliesWhen: 'Polly applies its own jitter curve; the worst case is modelled at the unjittered exponential.',
      },
      retryOn: {
        value: ['5xx', '408', '429', 'HttpRequestException', 'TimeoutRejectedException'],
        citationId: 'msext-handled-outcomes',
      },
      idempotent: {
        value: false,
        citationId: 'msext-all-methods',
        appliesWhen: 'Retries apply to every HTTP method, POST included, unless DisableForUnsafeHttpMethods() is called.',
      },
    },
    surprise:
      'One line of setup turns a request into four and retries POST by default. Its own defaults do not fit together: four 10s attempts plus backoff cannot happen inside its 30s total.',
  },
  {
    id: 'polly',
    product: 'Polly',
    label: 'Polly retry (bare)',
    tier: 'library',
    blurb: 'A Polly v8 RetryStrategyOptions with no properties set.',
    timeoutScope: { value: 'per-attempt' },
    defaults: {
      totalTries: { value: 4, citationId: 'polly-retry-defaults' },
      backoff: {
        value: { kind: 'fixed', baseMs: 2000, multiplier: 1, capMs: 'none', jitter: 'none' },
        citationId: 'polly-retry-defaults',
      },
    },
    surprise:
      'Not the same defaults as the .NET handler built on it: constant 2s waits with jitter off, so every client retries in lockstep.',
  },
  {
    id: 'resilience4j',
    product: 'resilience4j',
    label: 'resilience4j Retry',
    tier: 'library',
    blurb: 'A resilience4j Retry built from RetryConfig.ofDefaults().',
    timeoutScope: { value: 'per-attempt' },
    defaults: {
      totalTries: { value: 3, citationId: 'r4j-max-attempts' },
      backoff: {
        value: { kind: 'fixed', baseMs: 500, multiplier: 1, capMs: 'none', jitter: 'none' },
        citationId: 'r4j-wait-duration',
      },
      retryOn: { value: ['any'], citationId: 'r4j-retry-predicate' },
    },
    surprise:
      'Retries every exception, at a fixed 500ms with no jitter — a thundering herd by default. Add a TimeLimiter (1s by default) and whether it bounds one attempt or all three depends on decorator order.',
  },
  {
    id: 'urllib3',
    product: 'urllib3',
    label: 'urllib3',
    tier: 'library',
    blurb: 'Raw urllib3 (and libraries built on it) with no retries argument.',
    timeoutScope: { value: 'per-attempt' },
    defaults: {
      totalTries: { value: 4, citationId: 'urllib3-default-retry' },
      backoff: {
        value: { kind: 'none', baseMs: 0, multiplier: 1, capMs: 'none', jitter: 'none' },
        citationId: 'urllib3-backoff-zero',
      },
      retryOn: {
        value: ['connect', 'read'],
        citationId: 'urllib3-default-retry',
        appliesWhen: 'Status codes are only retried when status_forcelist is set.',
      },
    },
    surprise:
      'Three retries with zero delay between them: a hot loop against whatever is already struggling. (requests switches this off; plenty of SDKs built on urllib3 do not.)',
  },
  {
    id: 'spring-lb',
    product: 'Spring Cloud',
    label: 'Spring Cloud LoadBalancer',
    tier: 'library',
    blurb: 'A load-balanced RestTemplate with spring-retry on the classpath.',
    timeoutScope: { value: 'per-attempt' },
    defaults: {
      totalTries: {
        value: 2,
        citationId: 'spring-lb-retry-counts',
        appliesWhen: 'Retries switch on by adding spring-retry to the classpath — often transitively.',
      },
      idempotent: {
        value: true,
        citationId: 'spring-lb-retry-counts',
        appliesWhen: 'retryOnAllOperations is false, so only GET is retried.',
      },
    },
    surprise:
      'Enabled by a jar, not a config line: a transitive dependency that pulls in spring-retry turns on a retry to a different instance for every load-balanced GET.',
  },
]

const BY_ID = new Map(LAYERS.map((l) => [l.id, l]))

export function layerKind(id: string): LayerKind | undefined {
  return BY_ID.get(id)
}
