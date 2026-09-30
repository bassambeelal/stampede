import { useCallback, useEffect, useState } from 'react'

export type ThemePref = 'system' | 'dark' | 'light'

const STORAGE_KEY = 'theme'

function readStoredPref(): ThemePref {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'dark' || raw === 'light' || raw === 'system') return raw
  } catch {
    // Private windows and blocked site data both throw on access; the system
    // preference is a perfectly good answer.
  }
  return 'system'
}

function systemPrefersLight(): boolean {
  return (
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-color-scheme: light)').matches
  )
}

/** Resolve a preference to the class the document should actually carry. */
export function resolveTheme(pref: ThemePref): 'dark' | 'light' {
  if (pref === 'system') return systemPrefersLight() ? 'light' : 'dark'
  return pref
}

function applyTheme(pref: ThemePref) {
  document.documentElement.classList.toggle(
    'theme-light',
    resolveTheme(pref) === 'light',
  )
}

/**
 * Theme preference, persisted per browser and kept in sync with the OS while
 * the preference is `system`.
 */
export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(readStoredPref)

  useEffect(() => {
    applyTheme(pref)
    try {
      localStorage.setItem(STORAGE_KEY, pref)
    } catch {
      // Not being able to remember the choice is not worth breaking render for.
    }
  }, [pref])

  // Follow the OS only while the user has not pinned a theme.
  useEffect(() => {
    if (pref !== 'system' || typeof matchMedia !== 'function') return
    const mq = matchMedia('(prefers-color-scheme: light)')
    const onChange = () => applyTheme('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [pref])

  const cycle = useCallback(() => {
    setPref((p) => (p === 'dark' ? 'light' : p === 'light' ? 'system' : 'dark'))
  }, [])

  return { pref, setPref, cycle, resolved: resolveTheme(pref) }
}
