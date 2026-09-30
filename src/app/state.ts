import { useEffect, useReducer, useRef, useState } from 'react'
import { defaultsOnlyChain, genericHop, hopFromLayerId, nextHopId } from '../domain/hops'
import type { Chain, FailureClassId, FieldValue, Hop } from '../domain/model'
import { decodeChain, encodeChain } from '../domain/serialize'

export type Action =
  | { type: 'replace'; chain: Chain }
  | { type: 'failureClass'; id: FailureClassId }
  | { type: 'insertHop'; layerId: string | null; at: number }
  | { type: 'appendHops'; hops: readonly Hop[] }
  | { type: 'removeHop'; id: string }
  | { type: 'moveHop'; id: string; by: -1 | 1 }
  | { type: 'updateHop'; id: string; patch: Partial<Hop> }
  | { type: 'load'; field: 'rps' | 'meanLatencyMs' | 'errorRate'; value: FieldValue<number> }

export const MAX_HOPS = 12

function reducer(chain: Chain, action: Action): Chain {
  switch (action.type) {
    case 'replace':
      return action.chain
    case 'failureClass':
      return { ...chain, failureClass: action.id }
    case 'insertHop': {
      if (chain.hops.length >= MAX_HOPS) return chain
      const id = nextHopId(chain)
      const hop = action.layerId ? hopFromLayerId(action.layerId, id) : genericHop(id)
      const hops = [...chain.hops]
      hops.splice(Math.max(0, Math.min(action.at, hops.length)), 0, hop)
      return { ...chain, hops }
    }
    case 'appendHops': {
      // Re-key imported hops so ids stay unique however many imports happen.
      let next = chain
      for (const h of action.hops) {
        if (next.hops.length >= MAX_HOPS) break
        next = { ...next, hops: [...next.hops, { ...h, id: nextHopId(next) }] }
      }
      return next
    }
    case 'removeHop':
      return { ...chain, hops: chain.hops.filter((h) => h.id !== action.id) }
    case 'moveHop': {
      const i = chain.hops.findIndex((h) => h.id === action.id)
      const j = i + action.by
      if (i < 0 || j < 0 || j >= chain.hops.length) return chain
      const hops = [...chain.hops]
      ;[hops[i], hops[j]] = [hops[j]!, hops[i]!]
      return { ...chain, hops }
    }
    case 'updateHop':
      return {
        ...chain,
        hops: chain.hops.map((h) => (h.id === action.id ? { ...h, ...action.patch } : h)),
      }
    case 'load':
      return { ...chain, [action.field]: action.value }
  }
}

const HASH_KEY = 'c'

function readHash(): { chain: Chain; error: string | null; fromLink: boolean } {
  const params = new URLSearchParams(location.hash.slice(1))
  const raw = params.get(HASH_KEY)
  if (!raw) return { chain: defaultsOnlyChain(), error: null, fromLink: false }
  const r = decodeChain(raw)
  return r.ok
    ? { chain: r.chain, error: null, fromLink: true }
    : { chain: defaultsOnlyChain(), error: r.reason, fromLink: false }
}

export function permalinkFor(chain: Chain): string {
  const url = new URL(location.href)
  url.hash = `${HASH_KEY}=${encodeChain(chain)}`
  return url.toString()
}

/**
 * The chain, kept in the URL hash so every state is linkable. Writes use
 * replaceState so editing does not flood the back button; a pasted link
 * (a real hashchange) is read back in.
 */
export function useChain() {
  const [initial] = useState(readHash)
  const [chain, dispatch] = useReducer(reducer, initial.chain)
  const [linkError, setLinkError] = useState(initial.error)
  const lastWritten = useRef<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      const hash = `#${HASH_KEY}=${encodeChain(chain)}`
      if (hash !== location.hash) {
        lastWritten.current = hash
        history.replaceState(null, '', hash)
      }
    }, 120)
    return () => clearTimeout(t)
  }, [chain])

  useEffect(() => {
    const onHash = () => {
      if (location.hash === lastWritten.current) return
      const next = readHash()
      setLinkError(next.error)
      dispatch({ type: 'replace', chain: next.chain })
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return {
    chain,
    dispatch,
    linkError,
    dismissLinkError: () => setLinkError(null),
    openedFromLink: initial.fromLink,
  }
}
