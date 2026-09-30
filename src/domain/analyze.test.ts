import { describe, expect, it } from 'vitest'
import { analyze } from './analyze'
import { defaultsOnlyChain, emptyChain, genericHop, hopFromLayerId } from './hops'
import { declared, unknown, type Chain, type Hop } from './model'
import { CITATIONS } from './registry/citations'
import { LAYERS } from './registry/layers'
import { RULES } from './rules'

const chainOf = (hops: Hop[], over: Partial<Chain> = {}): Chain => ({
  ...emptyChain(),
  hops,
  ...over,
})

const ids = (c: Chain) => analyze(c).findings.map((f) => `${f.ruleId}:${f.verdict}`)

describe('registry integrity', () => {
  it('every layer default points at a real citation', () => {
    for (const layer of LAYERS) {
      const d = layer.defaults
      for (const field of Object.values(d)) {
        if (field) expect(CITATIONS.has(field.citationId), `${layer.id}`).toBe(true)
      }
      if (layer.timeoutScope.citationId) {
        expect(CITATIONS.has(layer.timeoutScope.citationId)).toBe(true)
      }
      if (layer.retryLimiter) expect(CITATIONS.has(layer.retryLimiter.citationId)).toBe(true)
    }
  })

  it('every rule citation points at a real citation', () => {
    for (const rule of RULES) {
      for (const id of rule.citations) expect(CITATIONS.has(id), `${rule.id} -> ${id}`).toBe(true)
    }
  })

  it('every citation carries a verbatim quote and a URL', () => {
    for (const c of CITATIONS.values()) {
      expect(c.quote.length, c.id).toBeGreaterThan(10)
      expect(c.url).toMatch(/^https:\/\//)
    }
  })

  it('every set-field remedy the rules emit is backed by a citation', () => {
    const chains = [defaultsOnlyChain(), dotnetChain(), inverted(), urllib3Chain()]
    for (const c of chains) {
      for (const f of analyze(c).findings) {
        if (f.remedy?.kind === 'set-field') {
          expect(CITATIONS.has(f.remedy.citationId), f.ruleId).toBe(true)
        }
      }
    }
  })
})

describe('the defaults-only chain', () => {
  it('amplifies a refused connection 81x with no retry config written anywhere', () => {
    // ingress-nginx 3 x Istio 3 x Istio 3 x AWS SDK 3, every figure cited.
    const a = analyze(defaultsOnlyChain())
    expect(a.amplification).toBe(81)
    expect(a.qualifier).toBe('exact')
    expect(a.cumulative).toEqual([3, 9, 27, 81])
  })

  it('reports each inherited retry layer separately', () => {
    const a = analyze(defaultsOnlyChain())
    expect(a.findings.filter((f) => f.ruleId === 'RB202')).toHaveLength(4)
  })

  it('passes a plain HTTP 500 straight through Istio’s default retryOn', () => {
    // Istio's default policy retries connect-failure, refused-stream,
    // unavailable and cancelled — not a 500.
    const a = analyze({ ...defaultsOnlyChain(), failureClass: 'http-500' })
    const istio = a.facts.filter((f) => f.layer?.id === 'istio-sidecar')
    expect(istio.every((f) => f.effectiveTries === 1)).toBe(true)
    // ingress-nginx's "error timeout" does not cover a 500 either; the SDK does.
    expect(a.amplification).toBe(3)
  })

  it('flags retries at multiple layers', () => {
    expect(ids(defaultsOnlyChain())).toContain('RB201:fail')
  })
})

describe('the .NET standard resilience handler', () => {
  it('can only reach two of its four attempts inside its own 30s total', () => {
    // 10s x 3 attempts + 2s + 4s of backoff = 36s > 30s.
    const a = analyze(dotnetChain())
    expect(a.facts[0]!.deadline.reachableTries).toBe(2)
    expect(ids(dotnetChain())).toContain('RB102:fail')
  })

  it('flags that it retries non-idempotent methods by default', () => {
    const f = analyze(dotnetChain()).findings.find((x) => x.ruleId === 'RB303')
    expect(f?.verdict).toBe('fail')
    expect(f?.citations).toContain('msext-all-methods')
  })

  it('caps timeout amplification at the reachable attempts', () => {
    const a = analyze({ ...dotnetChain(), failureClass: 'attempt-timeout' })
    expect(a.amplification).toBe(2)
    // A refused connection fails fast, so all four attempts can happen.
    const fast = analyze({ ...dotnetChain(), failureClass: 'connect-failure' })
    expect(fast.amplification).toBe(4)
  })
})

describe('inverted per-try timeout', () => {
  it('fires RB101 and not the more generic RB102 for the same hop', () => {
    const found = ids(inverted())
    expect(found).toContain('RB101:fail')
    expect(found).not.toContain('RB102:fail')
  })

  it('offers a per-try timeout that lets every attempt fit', () => {
    const f = analyze(inverted()).findings.find((x) => x.ruleId === 'RB101')!
    expect(f.remedy?.kind).toBe('set-field')
    // (5000 - 25 - 75) / 3 = 1633ms
    if (f.remedy?.kind === 'set-field') expect(f.remedy.toValue).toBe('1.63s')
  })
})

describe('unknowns', () => {
  it('turns the headline into a lower bound when a try count is unknown', () => {
    const hop = { ...genericHop('h1', 'Mystery'), totalTries: unknown<number>() }
    const a = analyze(chainOf([hopFromLayerId('istio-sidecar', 'h0'), hop], { failureClass: 'connect-failure' }))
    expect(a.qualifier).toBe('at-least')
    expect(a.amplification).toBe(3)
    expect(a.findings.some((f) => f.ruleId === 'RB001')).toBe(true)
  })

  it('assumes an unknown retryOn retries, so amplification is never understated', () => {
    const hop: Hop = { ...genericHop('h1'), totalTries: declared(4) }
    const a = analyze(chainOf([hop]))
    expect(a.facts[0]!.retryOnAssumed).toBe(true)
    expect(a.facts[0]!.effectiveTries).toBe(4)
  })

  it('reports no-deadline as needs-context when timeouts are unknown', () => {
    const found = ids(chainOf([genericHop('h1')]))
    expect(found).toContain('RB104:needs-context')
  })
})

describe('deadline propagation', () => {
  it('flags an inner hop that outlives its caller', () => {
    const outer: Hop = {
      ...genericHop('h1', 'Gateway'),
      totalTries: declared(1),
      timeoutMs: declared(2000),
      perTryTimeoutMs: declared('none'),
      retryOn: declared([]),
    }
    const inner: Hop = {
      ...genericHop('h2', 'Service'),
      totalTries: declared(1),
      timeoutMs: declared(10_000),
      perTryTimeoutMs: declared('none'),
      retryOn: declared([]),
    }
    const f = analyze(chainOf([outer, inner])).findings.find((x) => x.ruleId === 'RB103')
    expect(f?.verdict).toBe('fail')
    expect(f?.detail).toMatch(/8s of work after the caller has given up/)
  })
})

describe('backoff rules', () => {
  it('flags urllib3’s zero-delay retries', () => {
    expect(ids(urllib3Chain())).toContain('RB301:fail')
  })

  it('does not flag ingress-nginx, which retries a different upstream', () => {
    const f = analyze(chainOf([hopFromLayerId('ingress-nginx', 'h1')])).findings
    expect(f.some((x) => x.ruleId === 'RB301')).toBe(false)
  })

  it('flags resilience4j’s fixed, unjittered wait', () => {
    expect(ids(chainOf([hopFromLayerId('resilience4j', 'h1')]))).toContain('RB302:fail')
  })
})

describe('budgets', () => {
  it('does not report an AWS SDK hop as unbounded, because of its retry quota', () => {
    const a = analyze(chainOf([hopFromLayerId('aws-sdk', 'h1')], { failureClass: 'connect-failure' }))
    expect(a.findings.some((f) => f.ruleId === 'RB205')).toBe(false)
  })

  it('names a concurrency budget next to a rate budget as a mismatch', () => {
    const envoy: Hop = {
      ...genericHop('h1', 'Edge'),
      budget: declared({ kind: 'envoy-concurrency-pct', value: 20, floor: 3 }),
    }
    const linkerd: Hop = {
      ...genericHop('h2', 'Mesh'),
      budget: declared({ kind: 'rate-ratio', value: 0.2, floor: 10 }),
    }
    expect(ids(chainOf([envoy, linkerd]))).toContain('RB206:fail')
  })

  it('flags a retry ratio above 10% at the declared error rate', () => {
    const c = chainOf([hopFromLayerId('aws-sdk', 'h1')], {
      failureClass: 'connect-failure',
      errorRate: declared(0.2),
    })
    // 1 + 0.2 + 0.04 = 1.24, so 24% of calls are retries.
    const f = analyze(c).findings.find((x) => x.ruleId === 'RB204')
    expect(f?.detail).toMatch(/24%/)
  })
})

describe('ordering', () => {
  it('lists failures before needs-context, worst severity first', () => {
    const fs = analyze(dotnetChain()).findings
    const firstNeeds = fs.findIndex((f) => f.verdict === 'needs-context')
    const lastFail = fs.map((f) => f.verdict).lastIndexOf('fail')
    if (firstNeeds !== -1) expect(lastFail).toBeLessThan(firstNeeds)
    expect(fs[0]!.severity).toBe('critical')
  })
})

// ---- fixtures -----------------------------------------------------------------

function dotnetChain(): Chain {
  return chainOf([hopFromLayerId('dotnet-standard-resilience', 'h1', 'Checkout client')], {
    failureClass: 'attempt-timeout',
  })
}

function urllib3Chain(): Chain {
  return chainOf([hopFromLayerId('urllib3', 'h1', 'Python worker')], {
    failureClass: 'connect-failure',
  })
}

function inverted(): Chain {
  const hop = hopFromLayerId('istio-sidecar', 'h1', 'Payments sidecar')
  return chainOf([
    { ...hop, timeoutMs: declared(5000), perTryTimeoutMs: declared(10_000) },
  ])
}
