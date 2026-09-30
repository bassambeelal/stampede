import { describe, expect, it } from 'vitest'
import { analyze } from './analyze'
import { defaultsOnlyChain, genericHop } from './hops'
import { ingestConfig, parseDuration } from './ingest'
import { declared } from './model'
import { buildReport } from './report'
import { decodeChain, encodeChain } from './serialize'

describe('permalink round trip', () => {
  it('decodes exactly what it encoded', () => {
    const c = {
      ...defaultsOnlyChain(),
      errorRate: declared(0.05),
      hops: [
        ...defaultsOnlyChain().hops,
        {
          ...genericHop('h9', 'Payments — “primary”'),
          totalTries: declared(4),
          budget: declared({ kind: 'envoy-concurrency-pct' as const, value: 20, floor: 3 }),
        },
      ],
    }
    const back = decodeChain(encodeChain(c))
    expect(back).toEqual({ ok: true, chain: c })
  })

  it('is deterministic', () => {
    expect(encodeChain(defaultsOnlyChain())).toBe(encodeChain(defaultsOnlyChain()))
  })

  it('refuses a link from a different schema version rather than guessing', () => {
    const bad = btoa(JSON.stringify({ v: 99, f: 'http-503', h: [], r: 0, l: 0, e: 0 }))
      .replace(/=+$/, '')
    const r = decodeChain(bad)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/schema version 99/)
  })

  it('refuses garbage', () => {
    expect(decodeChain('not~a~chain').ok).toBe(false)
    expect(decodeChain('e30').ok).toBe(false) // "{}"
  })
})

describe('parseDuration', () => {
  it.each([
    ['250ms', 250],
    ['1.5s', 1500],
    ['2m', 120_000],
    ['1h', 3_600_000],
    ['0s', 'none'],
  ])('reads %s', (input, expected) => {
    expect(parseDuration(input)).toBe(expected)
  })

  it('reads protobuf JSON durations', () => {
    expect(parseDuration({ seconds: 2, nanos: 500_000_000 })).toBe(2500)
  })

  it('returns null for what it cannot read', () => {
    expect(parseDuration('soon')).toBeNull()
  })
})

describe('Istio VirtualService ingest', () => {
  const vs = `
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: payments
spec:
  hosts: [payments]
  http:
  - name: charge
    timeout: 5s
    retries:
      attempts: 3
      perTryTimeout: 10s
      retryOn: 5xx,reset
      retryRemoteLocalities: true
  - name: status
    route:
    - destination: { host: payments }
`

  it('normalises attempts to total calls and keeps defaults where unset', () => {
    const r = ingestConfig(vs, 1)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const [charge, status] = r.results[0]!.hops
    expect(charge!.totalTries).toEqual(declared(4))
    expect(charge!.timeoutMs).toEqual(declared(5000))
    expect(charge!.perTryTimeoutMs).toEqual(declared(10_000))
    expect(charge!.retryOn).toEqual(declared(['5xx', 'reset']))
    // The route with no retries block still carries Istio's default.
    expect(status!.totalTries.state).toBe('inherited')
  })

  it('reports keys it does not model instead of dropping them', () => {
    const r = ingestConfig(vs, 1)
    if (!r.ok) throw new Error(r.reason)
    expect(r.results[0]!.notModeled).toEqual(['http[0].retries.retryRemoteLocalities'])
  })

  it('produces a chain that trips the inverted per-try rule', () => {
    const r = ingestConfig(vs, 1)
    if (!r.ok) throw new Error(r.reason)
    const a = analyze({ ...defaultsOnlyChain(), hops: [r.results[0]!.hops[0]!] })
    expect(a.findings.some((f) => f.ruleId === 'RB101')).toBe(true)
  })
})

describe('Envoy route ingest', () => {
  it('reads a route action with a retry policy', () => {
    const json = JSON.stringify({
      virtual_hosts: [
        {
          name: 'backend',
          routes: [
            {
              match: { prefix: '/' },
              route: {
                cluster: 'orders',
                timeout: '2s',
                retry_policy: {
                  retry_on: '5xx',
                  per_try_timeout: '0.5s',
                  retry_back_off: { base_interval: '0.1s' },
                  host_selection_retry_max_attempts: 3,
                },
              },
            },
          ],
        },
      ],
    })
    const r = ingestConfig(json, 1)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const hop = r.results[0]!.hops[0]!
    // retry_policy without num_retries means Envoy's documented default of one retry.
    expect(hop.totalTries).toEqual({ state: 'inherited', value: 2, citationId: 'envoy-num-retries' })
    expect(hop.timeoutMs).toEqual(declared(2000))
    expect(hop.perTryTimeoutMs).toEqual(declared(500))
    expect(hop.backoff.state).toBe('declared')
    expect(r.results[0]!.notModeled).toContain(
      'virtual_hosts[0].routes[0].route.retry_policy.host_selection_retry_max_attempts',
    )
  })

  it('refuses input with nothing it can read', () => {
    const r = ingestConfig('kind: Deployment\nmetadata: {name: x}', 1)
    expect(r.ok).toBe(false)
  })
})

describe('report', () => {
  it('leads with the path and headline and cites every finding', () => {
    const text = buildReport(analyze(defaultsOnlyChain()), 'https://example.test/#c=abc')
    expect(text).toMatch(/Path: Ingress → API service sidecar/)
    expect(text).toMatch(/Worst-case amplification: 81x \(3 x 3 x 3 x 3\)/)
    expect(text).toMatch(/\[RB201\]/)
    expect(text).toMatch(/Source: Istio/)
    expect(text).toMatch(/Open this analysis: https:\/\/example\.test/)
  })
})
