import type { Citation, CitationId } from '../model'

/**
 * Every quote below is verbatim from the linked primary source, as read on the
 * retrieval date. Nothing here is paraphrased: the quote is the evidence, so a
 * reworded quote would be a fabricated one. Where a source puts the value in a
 * table, cells are joined with ` | ` as they appear on the page.
 *
 * Vendor defaults drift. The retrieval date is shown on every card that cites
 * one of these, alongside a reminder to check the version actually deployed.
 */

const RETRIEVED = '2026-09-30'

const ISTIO_VS = 'https://istio.io/latest/docs/reference/config/networking/virtual-service/'
const ISTIO_PROTO =
  'https://github.com/istio/api/blob/master/networking/v1alpha3/virtual_service.proto'
const ENVOY_ROUTER =
  'https://www.envoyproxy.io/docs/envoy/latest/configuration/http/http_filters/router_filter'
const ENVOY_ROUTE_PROTO =
  'https://www.envoyproxy.io/docs/envoy/latest/api-v3/config/route/v3/route_components.proto'
const ENVOY_CB_PROTO =
  'https://www.envoyproxy.io/docs/envoy/latest/api-v3/config/cluster/v3/circuit_breaker.proto'
const AWS_RETRY = 'https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html'
const AWS_SIM =
  'https://github.com/aws-samples/aws-arch-backoff-simulator/blob/master/src/backoff_simulator.py'
const GRPC_SC_PROTO =
  'https://github.com/grpc/grpc-proto/blob/master/grpc/service_config/service_config.proto'
const MS_RESILIENCE = 'https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience'
const R4J_RETRY = 'https://resilience4j.readme.io/docs/retry'
const GEP_3388 = 'https://gateway-api.sigs.k8s.io/geps/gep-3388/'
const SRE_OVERLOAD = 'https://sre.google/sre-book/handling-overload/'
const SRE_CASCADING = 'https://sre.google/sre-book/addressing-cascading-failures/'
const INGRESS_NGINX =
  'https://kubernetes.github.io/ingress-nginx/user-guide/nginx-configuration/configmap/'

const list: Citation[] = [
  // ---- Istio ---------------------------------------------------------------
  {
    id: 'istio-default-retry-policy',
    product: 'Istio',
    title: 'VirtualService reference — HTTPRetry',
    url: ISTIO_VS,
    quote:
      'Note: the default cluster-wide retry policy, if not specified, is: attempts: 2 retryOn: "connect-failure,refused-stream,unavailable,cancelled"',
    docVersion: 'istio.io/latest',
    retrieved: RETRIEVED,
  },
  {
    id: 'istio-attempts-semantics',
    product: 'Istio',
    title: 'HTTPRetry.attempts',
    url: ISTIO_PROTO,
    quote:
      'Number of retries to be allowed for a given request. The interval between retries will be determined automatically (25ms+). When request `timeout` of the HTTP route or `per_try_timeout` is configured, the actual number of retries attempted also depends on the specified request `timeout` and `per_try_timeout` values. MUST be >= 0. If `0`, retries will be disabled. The maximum possible number of requests made will be 1 + `attempts`.',
    docVersion: 'istio/api master',
    retrieved: RETRIEVED,
  },
  {
    id: 'istio-meshconfig-retry-policy',
    product: 'Istio',
    title: 'MeshConfig — defaultHttpRetryPolicy',
    url: 'https://istio.io/latest/docs/reference/config/istio.mesh.v1alpha1/',
    quote:
      'The default number of retry attempts is set at 2 for these errors: "connect-failure,refused-stream,unavailable,cancelled,retriable-status-codes". Setting the number of attempts to 0 disables retry policy globally.',
    docVersion: 'istio.io/latest',
    retrieved: RETRIEVED,
  },
  {
    id: 'istio-per-try-timeout',
    product: 'Istio',
    title: 'HTTPRetry.perTryTimeout',
    url: ISTIO_PROTO,
    quote:
      'Timeout per attempt for a given request, including the initial call and any retries. Format: 1h/1m/1s/1ms. MUST be >=1ms. Default is same value as request `timeout` of the HTTP route, which means no timeout.',
    docVersion: 'istio/api master',
    retrieved: RETRIEVED,
  },
  {
    id: 'istio-route-timeout',
    product: 'Istio',
    title: 'Request timeouts task',
    url: 'https://istio.io/latest/docs/tasks/traffic-management/request-timeouts/',
    quote: 'By default, the request timeout is disabled',
    docVersion: 'istio.io/latest',
    retrieved: RETRIEVED,
  },

  // ---- Envoy ---------------------------------------------------------------
  {
    id: 'envoy-route-timeout',
    product: 'Envoy',
    title: 'RouteAction.timeout',
    url: ENVOY_ROUTE_PROTO,
    quote: 'Specifies the upstream timeout for the route. If not specified, the default is 15s.',
    docVersion: 'Envoy latest (v3 API)',
    retrieved: RETRIEVED,
  },
  {
    id: 'envoy-num-retries',
    product: 'Envoy',
    title: 'RetryPolicy.num_retries',
    url: ENVOY_ROUTE_PROTO,
    quote: 'Specifies the allowed number of retries. This parameter is optional and defaults to 1.',
    docVersion: 'Envoy latest (v3 API)',
    retrieved: RETRIEVED,
  },
  {
    id: 'envoy-no-retry-by-default',
    product: 'Envoy',
    title: 'Router filter',
    url: ENVOY_ROUTER,
    quote:
      'If a retry policy is not configured and x-envoy-retry-on or x-envoy-retry-grpc-on headers are not specified, Envoy will not retry a failed request.',
    docVersion: 'Envoy latest',
    retrieved: RETRIEVED,
  },
  {
    id: 'envoy-per-try-ignored',
    product: 'Envoy',
    title: 'Router filter — per-try timeout',
    url: ENVOY_ROUTER,
    quote:
      'If a global route timeout is configured, this timeout must be less than the global route timeout or it is ignored. This allows a caller to set a tight per try timeout to allow for retries while maintaining a reasonable overall timeout.',
    docVersion: 'Envoy latest',
    retrieved: RETRIEVED,
  },
  {
    id: 'envoy-retries-within-timeout',
    product: 'Envoy',
    title: 'HTTP routing — retry semantics',
    url: 'https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/http/http_routing',
    quote: 'All retries are contained within the overall request timeout.',
    docVersion: 'Envoy latest',
    retrieved: RETRIEVED,
  },
  {
    id: 'envoy-default-backoff',
    product: 'Envoy',
    title: 'Router filter — retry back-off',
    url: ENVOY_ROUTER,
    quote:
      'By default, Envoy uses a fully jittered exponential back-off algorithm for retries with a default base interval of 25ms. … The interval is capped at a maximum interval, which defaults to 10 times the base interval (250ms). … Given a base interval B and retry number N, the back-off for the retry is in the range [0, (2^N-1)B).',
    docVersion: 'Envoy latest',
    retrieved: RETRIEVED,
  },
  {
    id: 'envoy-retry-on-5xx',
    product: 'Envoy',
    title: 'Router filter — x-envoy-retry-on: 5xx',
    url: ENVOY_ROUTER,
    quote:
      'Envoy will attempt a retry if the upstream server responds with any 5xx response code, or does not respond at all (disconnect/reset/read timeout).',
    docVersion: 'Envoy latest',
    retrieved: RETRIEVED,
  },
  {
    id: 'envoy-retry-budget',
    product: 'Envoy',
    title: 'CircuitBreakers.Thresholds.RetryBudget.budget_percent',
    url: ENVOY_CB_PROTO,
    quote:
      'Specifies the limit on concurrent retries as a percentage of the sum of active requests and active pending requests. For example, if there are 100 active requests and the budget_percent is set to 25, there may be 25 active retries. This parameter is optional. Defaults to 20%.',
    docVersion: 'Envoy latest (v3 API)',
    retrieved: RETRIEVED,
  },
  {
    id: 'envoy-min-retry-concurrency',
    product: 'Envoy',
    title: 'RetryBudget.min_retry_concurrency',
    url: ENVOY_CB_PROTO,
    quote:
      'Specifies the minimum retry concurrency allowed for the retry budget. The limit on the number of active retries may never go below this number. This parameter is optional. Defaults to 3.',
    docVersion: 'Envoy latest (v3 API)',
    retrieved: RETRIEVED,
  },

  // ---- ingress-nginx ---------------------------------------------------------
  {
    id: 'ingress-nginx-next-upstream',
    product: 'ingress-nginx',
    title: 'ConfigMap — proxy-next-upstream',
    url: INGRESS_NGINX,
    quote:
      'proxy-next-upstream: Specifies in which cases a request should be passed to the next server. default: "error timeout"',
    docVersion: 'ingress-nginx current',
    retrieved: RETRIEVED,
  },
  {
    id: 'ingress-nginx-next-upstream-tries',
    product: 'ingress-nginx',
    title: 'ConfigMap — proxy-next-upstream-tries',
    url: INGRESS_NGINX,
    quote:
      'proxy-next-upstream-tries: Limit the number of possible tries a request should be passed to the next server. default: 3',
    docVersion: 'ingress-nginx current',
    retrieved: RETRIEVED,
  },

  // ---- Linkerd ---------------------------------------------------------------
  {
    id: 'linkerd-opt-in',
    product: 'Linkerd',
    title: 'Retries and timeouts',
    url: 'https://linkerd.io/2-edge/features/retries-and-timeouts/',
    quote: 'Retries are an opt-in behavior that require some thought and planning.',
    docVersion: 'Linkerd 2-edge',
    retrieved: RETRIEVED,
  },
  {
    id: 'linkerd-retry-limit',
    product: 'Linkerd',
    title: 'Retries reference — retry.linkerd.io/limit',
    url: 'https://linkerd.io/2-edge/reference/retries/',
    quote:
      '`retry.linkerd.io/limit`: The maximum number of times a request can be retried. If unspecified, the default is `1`.',
    docVersion: 'Linkerd 2-edge',
    retrieved: RETRIEVED,
  },
  {
    id: 'linkerd-retry-budget',
    product: 'Linkerd',
    title: 'Configuring retries — retry budgets',
    url: 'https://linkerd.io/2.15/tasks/configuring-retries/',
    quote:
      'By default, retries may add at most an additional 20% to the request load (plus an additional 10 "free" retries per second).',
    docVersion: 'Linkerd 2.15 (ServiceProfiles, deprecated in 2.16)',
    retrieved: RETRIEVED,
  },

  // ---- AWS SDKs --------------------------------------------------------------
  {
    id: 'aws-max-attempts',
    product: 'AWS SDKs',
    title: 'Retry behavior — max attempts',
    url: AWS_RETRY,
    quote:
      'A max attempts value of `3` means the SDK makes one initial request and up to two retries. Set max attempts to `1` to disable retries entirely.',
    docVersion: 'AWS SDKs and Tools reference guide',
    retrieved: RETRIEVED,
  },
  {
    id: 'aws-backoff-formula',
    product: 'AWS SDKs',
    title: 'Retry behavior — backoff formula',
    url: AWS_RETRY,
    quote:
      'delay = random(0, 1) × min(20,000 ms, base_delay × 2^retry) … `base_delay` is 50 ms for transient errors or 1,000 ms for throttling errors … `retry` starts at 0 for the first retry (the second overall request attempt)',
    docVersion: 'AWS SDKs and Tools reference guide',
    retrieved: RETRIEVED,
  },
  {
    id: 'aws-transient-errors',
    product: 'AWS SDKs',
    title: 'Retry behavior — error classification',
    url: AWS_RETRY,
    quote:
      'Transient errors are retried with a short base delay (50 ms): … I/O Failure (Connection reset, DNS resolution failure, socket timeout) | (any HTTP 500, 502, 503, or 504 without a recognized error code)',
    docVersion: 'AWS SDKs and Tools reference guide',
    retrieved: RETRIEVED,
  },
  {
    id: 'aws-jitter-why',
    product: 'AWS SDKs',
    title: 'Retry behavior — why jitter matters',
    url: AWS_RETRY,
    quote:
      'The random multiplier is called full jitter. Without it, all clients that hit an error at the same time would retry at the same time, creating a burst of retry traffic (the "thundering herd" problem).',
    docVersion: 'AWS SDKs and Tools reference guide',
    retrieved: RETRIEVED,
  },
  {
    id: 'aws-retry-quota',
    product: 'AWS SDKs',
    title: 'Retry behavior — retry quota',
    url: AWS_RETRY,
    quote:
      'Budget capacity | 500 tokens | Cost per transient (non-throttling) retry | 14 tokens … With the default of 3 max attempts, the quota begins to drain when more than approximately 22% of requests result in sustained transient failures',
    docVersion: 'AWS SDKs and Tools reference guide',
    retrieved: RETRIEVED,
  },
  {
    id: 'aws-new-retries-optin',
    product: 'AWS SDKs',
    title: 'Retry behavior — opt-in notice',
    url: AWS_RETRY,
    quote:
      'The behavior described on this page requires opting in until it becomes the default behavior. Set `AWS_NEW_RETRIES_2026=true` in your environment. Without this setting, your SDK uses pre-2026 retry behavior, which differs in backoff timing, retry quota costs, and service-specific defaults.',
    docVersion: 'AWS SDKs and Tools reference guide',
    retrieved: RETRIEVED,
  },
  {
    id: 'boto3-legacy-default',
    product: 'Boto3',
    title: 'Retries guide — legacy mode',
    url: 'https://docs.aws.amazon.com/boto3/latest/guide/retries.html',
    quote:
      'Legacy mode is the default mode used by any Boto3 client you create. … A default value of 5 for maximum attempts (including the initial request).',
    docVersion: 'Boto3 latest',
    retrieved: RETRIEVED,
  },

  // ---- gRPC ------------------------------------------------------------------
  {
    id: 'grpc-no-default-policy',
    product: 'gRPC',
    title: 'Retry guide',
    url: 'https://grpc.io/docs/guides/retry/',
    quote: 'Retries are enabled by default, but there is no default retry policy.',
    docVersion: 'grpc.io',
    retrieved: RETRIEVED,
  },
  {
    id: 'grpc-max-attempts-cap',
    product: 'gRPC',
    title: 'Service config — RetryPolicy.max_attempts',
    url: GRPC_SC_PROTO,
    quote:
      'The maximum number of RPC attempts, including the original attempt. This field is required and must be greater than 1. Any value greater than 5 will be treated as if it were 5.',
    docVersion: 'grpc-proto master',
    retrieved: RETRIEVED,
  },
  {
    id: 'grpc-backoff',
    product: 'gRPC',
    title: 'Service config — RetryPolicy backoff',
    url: GRPC_SC_PROTO,
    quote:
      'Exponential backoff parameters. The initial retry attempt will occur at random(0, initial_backoff). In general, the nth attempt will occur at random(0, min(initial_backoff*backoff_multiplier**(n-1), max_backoff)). Required. Must be greater than zero.',
    docVersion: 'grpc-proto master',
    retrieved: RETRIEVED,
  },
  {
    id: 'grpc-deadline-propagation',
    product: 'gRPC',
    title: 'Deadlines guide',
    url: 'https://grpc.io/docs/guides/deadlines/',
    quote:
      'Your server might need to call another server to produce a response. In these cases where your server also acts as a client you would want to honor the deadline set by the original client.',
    docVersion: 'grpc.io',
    retrieved: RETRIEVED,
  },
  {
    id: 'grpc-no-default-deadline',
    product: 'gRPC',
    title: 'Deadlines guide',
    url: 'https://grpc.io/docs/guides/deadlines/',
    quote:
      'By default, gRPC does not set a deadline which means it is possible for a client to end up waiting for a response effectively forever.',
    docVersion: 'grpc.io',
    retrieved: RETRIEVED,
  },
  {
    id: 'grpc-wasted-work',
    product: 'gRPC',
    title: 'Deadlines guide',
    url: 'https://grpc.io/docs/guides/deadlines/',
    quote:
      'A server might receive RPCs from a client with an unrealistically short deadline that would not give the server enough time to ever respond in time. This would result in the server just wasting valuable resources and in the worst case scenario, crash the server.',
    docVersion: 'grpc.io',
    retrieved: RETRIEVED,
  },

  // ---- Application libraries ---------------------------------------------------
  {
    id: 'r4j-max-attempts',
    product: 'resilience4j',
    title: 'Retry — maxAttempts',
    url: R4J_RETRY,
    quote:
      'maxAttempts | 3 | The maximum number of attempts (including the initial call as the first attempt)',
    docVersion: 'resilience4j docs',
    retrieved: RETRIEVED,
  },
  {
    id: 'r4j-wait-duration',
    product: 'resilience4j',
    title: 'Retry — waitDuration and intervalFunction',
    url: R4J_RETRY,
    quote:
      'waitDuration | 500 [ms] | A fixed wait duration between retry attempts … intervalFunction | numOfAttempts -> waitDuration | A function to modify the waiting interval after a failure. By default the wait duration remains constant.',
    docVersion: 'resilience4j docs',
    retrieved: RETRIEVED,
  },
  {
    id: 'r4j-timelimiter',
    product: 'resilience4j',
    title: 'TimeLimiterConfig source',
    url: 'https://github.com/resilience4j/resilience4j/blob/master/resilience4j-timelimiter/src/main/java/io/github/resilience4j/timelimiter/TimeLimiterConfig.java',
    quote: 'private Duration timeoutDuration = Duration.ofSeconds(1);',
    docVersion: 'resilience4j master',
    retrieved: RETRIEVED,
  },
  {
    id: 'msext-total-timeout',
    product: 'Microsoft.Extensions.Http.Resilience',
    title: 'Standard resilience handler — total timeout',
    url: MS_RESILIENCE,
    quote:
      "Total timeout | The total request timeout pipeline applies an overall timeout to the execution, ensuring that the request, including retry attempts, doesn't exceed the configured limit. | Total timeout: 30s",
    docVersion: 'learn.microsoft.com, .NET 8+',
    retrieved: RETRIEVED,
  },
  {
    id: 'msext-retry',
    product: 'Microsoft.Extensions.Http.Resilience',
    title: 'Standard resilience handler — retry',
    url: MS_RESILIENCE,
    quote:
      'Retry | The retry pipeline retries the request in case the dependency is slow or returns a transient error. | Max retries: `3` Backoff: `Exponential` Use jitter: `true` Delay: 2s',
    docVersion: 'learn.microsoft.com, .NET 8+',
    retrieved: RETRIEVED,
  },
  {
    id: 'msext-attempt-timeout',
    product: 'Microsoft.Extensions.Http.Resilience',
    title: 'Standard resilience handler — attempt timeout',
    url: MS_RESILIENCE,
    quote:
      "Attempt timeout | The attempt timeout pipeline limits each request attempt duration and throws if it's exceeded. | Attempt timeout: 10s",
    docVersion: 'learn.microsoft.com, .NET 8+',
    retrieved: RETRIEVED,
  },
  {
    id: 'msext-all-methods',
    product: 'Microsoft.Extensions.Http.Resilience',
    title: 'Standard resilience handler — retried methods',
    url: MS_RESILIENCE,
    quote:
      'By default, the standard resilience handler is configured to make retries for all HTTP methods. For some applications, such behavior could be undesirable or even harmful. For example, if a POST request inserts a new record to a database, then making retries for such a request could lead to data duplication.',
    docVersion: 'learn.microsoft.com, .NET 8+',
    retrieved: RETRIEVED,
  },
  {
    id: 'polly-retry-defaults',
    product: 'Polly',
    title: 'Retry strategy — defaults',
    url: 'https://www.pollydocs.org/strategies/retry.html',
    quote: 'MaxRetryAttempts | 3 ... BackoffType | Constant ... Delay | 2 seconds ... UseJitter | False',
    docVersion: 'Polly v8',
    retrieved: RETRIEVED,
  },
  {
    id: 'r4j-retry-predicate',
    product: 'resilience4j',
    title: 'Retry — retryExceptionPredicate',
    url: R4J_RETRY,
    quote:
      'retryExceptionPredicate | throwable -> true | Configures a Predicate which evaluates if an exception should be retried. The Predicate must return true, if the exception should be retried, otherwise it must return false.',
    docVersion: 'resilience4j docs',
    retrieved: RETRIEVED,
  },
  {
    id: 'urllib3-default-retry',
    product: 'urllib3',
    title: 'util/retry.py',
    url: 'https://github.com/urllib3/urllib3/blob/main/src/urllib3/util/retry.py',
    quote: 'Retry.DEFAULT = Retry(3)',
    docVersion: 'urllib3 main',
    retrieved: RETRIEVED,
  },
  {
    id: 'urllib3-backoff-zero',
    product: 'urllib3',
    title: 'urllib3.util.Retry — backoff_factor',
    url: 'https://urllib3.readthedocs.io/en/stable/reference/urllib3.util.html',
    quote: 'backoff_factor: float = 0',
    docVersion: 'urllib3 stable',
    retrieved: RETRIEVED,
  },
  {
    id: 'urllib3-allowed-methods',
    product: 'urllib3',
    title: 'util/retry.py — DEFAULT_ALLOWED_METHODS',
    url: 'https://github.com/urllib3/urllib3/blob/main/src/urllib3/util/retry.py',
    quote: 'DEFAULT_ALLOWED_METHODS = frozenset( ["HEAD", "GET", "PUT", "DELETE", "OPTIONS", "TRACE"] )',
    docVersion: 'urllib3 main',
    retrieved: RETRIEVED,
  },
  {
    id: 'requests-no-retry',
    product: 'requests',
    title: 'HTTPAdapter — max_retries',
    url: 'https://requests.readthedocs.io/en/latest/api/',
    quote:
      'The maximum number of retries each connection should attempt. Note, this applies only to failed DNS lookups, socket connections and connection timeouts, never to requests where data has made it to the server. By default, Requests does not retry failed connections.',
    docVersion: 'requests latest',
    retrieved: RETRIEVED,
  },
  {
    id: 'go-transport-retry',
    product: 'Go net/http',
    title: 'http.Transport',
    url: 'https://pkg.go.dev/net/http#Transport',
    quote:
      'Transport only retries a request upon encountering a network error if the connection has already been used successfully and if the request is idempotent and either has no body or has its Request.GetBody defined.',
    docVersion: 'Go stdlib (pkg.go.dev)',
    retrieved: RETRIEVED,
  },
  {
    id: 'spring-lb-retry',
    product: 'Spring Cloud LoadBalancer',
    title: 'Retrying failed requests',
    url: 'https://docs.spring.io/spring-cloud-commons/docs/current/reference/html/',
    quote:
      'A load-balanced `RestTemplate` can be configured to retry failed requests. By default, this logic is disabled. For the non-reactive version (with `RestTemplate`), you can enable it by adding Spring Retry to your application\'s classpath.',
    docVersion: 'spring-cloud-commons current',
    retrieved: RETRIEVED,
  },
  {
    id: 'spring-lb-retry-counts',
    product: 'Spring Cloud LoadBalancer',
    title: 'LoadBalancerProperties.Retry source',
    url: 'https://github.com/spring-cloud/spring-cloud-commons/blob/main/spring-cloud-commons/src/main/java/org/springframework/cloud/client/loadbalancer/LoadBalancerProperties.java',
    quote:
      'private boolean retryOnAllOperations = false; … private int maxRetriesOnSameServiceInstance = 0; … private int maxRetriesOnNextServiceInstance = 1;',
    docVersion: 'spring-cloud-commons main',
    retrieved: RETRIEVED,
  },
  {
    id: 'dotnet-httpclient-timeout',
    product: '.NET HttpClient',
    title: 'HttpClient.Timeout',
    url: 'https://learn.microsoft.com/en-us/dotnet/api/system.net.http.httpclient.timeout',
    quote: 'The default value is 100,000 milliseconds (100 seconds).',
    docVersion: 'learn.microsoft.com',
    retrieved: RETRIEVED,
  },

  // ---- Guidance and budgets -----------------------------------------------------
  {
    id: 'sre-per-request-budget',
    product: 'Google SRE book',
    title: 'Ch. 21, Handling Overload',
    url: SRE_OVERLOAD,
    quote: 'If a request has already failed three times, we let the failure bubble up to the caller.',
    docVersion: 'Site Reliability Engineering (2016)',
    retrieved: RETRIEVED,
  },
  {
    id: 'sre-client-retry-ratio',
    product: 'Google SRE book',
    title: 'Ch. 21, Handling Overload',
    url: SRE_OVERLOAD,
    quote:
      'Each client keeps track of the ratio of requests that correspond to retries. A request will only be retried as long as this ratio is below 10%.',
    docVersion: 'Site Reliability Engineering (2016)',
    retrieved: RETRIEVED,
  },
  {
    id: 'sre-process-retry-budget',
    product: 'Google SRE book',
    title: 'Ch. 22, Addressing Cascading Failures',
    url: SRE_CASCADING,
    quote:
      "For example, only allow 60 retries per minute in a process, and if the retry budget is exceeded, don't retry; just fail the request.",
    docVersion: 'Site Reliability Engineering (2016)',
    retrieved: RETRIEVED,
  },
  {
    id: 'sre-amplification-64',
    product: 'Google SRE book',
    title: 'Ch. 22, Addressing Cascading Failures',
    url: SRE_CASCADING,
    quote:
      "If the database can't service requests because it's overloaded, and the backend, frontend, and JavaScript layers all issue 3 retries (4 attempts), then a single user action may create 64 attempts (4^3) on the database.",
    docVersion: 'Site Reliability Engineering (2016)',
    retrieved: RETRIEVED,
  },
  {
    id: 'aws-retry-one-level',
    product: 'AWS Well-Architected',
    title: 'REL05-BP03 Control and limit retry calls',
    url: 'https://docs.aws.amazon.com/wellarchitected/latest/framework/rel_mitigate_interaction_failure_limit_retries.html',
    quote:
      'Retrying at multiple layers of your application stack in a manner which compounds retry attempts further consuming resources in a retry storm. Be sure to understand how these errors affect your application the dependencies you rely on, then implement retries at only one level.',
    docVersion: 'Well-Architected Framework, Reliability Pillar',
    retrieved: RETRIEVED,
  },
  {
    id: 'aws-jitter-none',
    product: 'AWS Architecture Blog',
    title: 'Exponential Backoff And Jitter — reference simulator',
    url: AWS_SIM,
    quote: 'def expo(self, n): return min(self.cap, pow(2, n)*self.base)',
    docVersion: 'aws-samples/aws-arch-backoff-simulator',
    retrieved: RETRIEVED,
  },
  {
    id: 'aws-jitter-full',
    product: 'AWS Architecture Blog',
    title: 'Exponential Backoff And Jitter — reference simulator',
    url: AWS_SIM,
    quote:
      'class ExpoBackoffFullJitter(Backoff): def backoff(self, n): v = self.expo(n) return random.uniform(0, v)',
    docVersion: 'aws-samples/aws-arch-backoff-simulator',
    retrieved: RETRIEVED,
  },
  {
    id: 'aws-jitter-decorrelated',
    product: 'AWS Architecture Blog',
    title: 'Exponential Backoff And Jitter — reference simulator',
    url: AWS_SIM,
    quote: 'self.sleep = min(self.cap, random.uniform(self.base, self.sleep * 3))',
    docVersion: 'aws-samples/aws-arch-backoff-simulator',
    retrieved: RETRIEVED,
  },
  {
    id: 'gep-3388-budget',
    product: 'Kubernetes Gateway API',
    title: 'GEP-3388 Retry Budgets — BudgetDetails',
    url: GEP_3388,
    quote:
      'Percent defines the maximum percentage of active requests that may be made up of retries. … +kubebuilder:default=20 … Interval defines the duration in which requests will be considered for calculating the budget for retries. … +kubebuilder:default="10s"',
    docVersion: 'GEP-3388',
    retrieved: RETRIEVED,
  },
  {
    id: 'gep-3388-min-retry-rate',
    product: 'Kubernetes Gateway API',
    title: 'GEP-3388 Retry Budgets — MinRetryRate',
    url: GEP_3388,
    quote:
      'MinRetryRate defines the minimum rate of retries that will be allowable over a specified duration of time. The effective overall minimum rate of retries targeting the backend service may be much higher, as there can be any number of clients which are applying this setting locally.',
    docVersion: 'GEP-3388',
    retrieved: RETRIEVED,
  },
  {
    id: 'gep-3388-not-equivalent',
    product: 'Kubernetes Gateway API',
    title: 'GEP-3388 Retry Budgets — Envoy and Linkerd',
    url: GEP_3388,
    quote:
      "While Envoy's `min_retry_concurrency` setting may behave similarly in practice to Linkerd's `minRetriesPerSecond`, they are not directly equivalent.",
    docVersion: 'GEP-3388',
    retrieved: RETRIEVED,
  },
]

export const CITATIONS: ReadonlyMap<CitationId, Citation> = new Map(
  list.map((c) => [c.id, c]),
)

/** Looks up a citation, failing loudly: a dangling id is a bug, not a soft miss. */
export function citation(id: CitationId): Citation {
  const c = CITATIONS.get(id)
  if (!c) throw new Error(`unknown citation id: ${id}`)
  return c
}

export function hasCitation(id: CitationId): boolean {
  return CITATIONS.has(id)
}
