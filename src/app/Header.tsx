import { Monitor, Moon, Sun } from 'lucide-react'
import type { ThemePref } from '../lib/useTheme'
import { Button } from '../ui/Button'
import { CopyButton } from '../ui/CopyButton'

export const REPO_URL = 'https://github.com/bassambeelal/stampede'

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <rect width="32" height="32" rx="8" className="fill-raised" />
      <g strokeWidth="2.4" strokeLinecap="round" fill="none" className="stroke-accent">
        <path d="M8.5 16 L23.5 8.5" />
        <path d="M8.5 16 H23.5" />
        <path d="M8.5 16 L23.5 23.5" />
      </g>
      <circle cx="8.5" cy="16" r="3.6" className="fill-accent" />
      <g className="fill-ink">
        <circle cx="24" cy="8.5" r="2.3" />
        <circle cx="24" cy="16" r="2.3" />
        <circle cx="24" cy="23.5" r="2.3" />
      </g>
    </svg>
  )
}

function GitHubMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}

const THEME_ICON = { dark: Moon, light: Sun, system: Monitor } as const
const THEME_NEXT = { dark: 'light', light: 'system', system: 'dark' } as const

export function Header({
  permalink,
  report,
  theme,
  onCycleTheme,
}: {
  permalink: () => string
  report: () => string
  theme: ThemePref
  onCycleTheme: () => void
}) {
  const ThemeIcon = THEME_ICON[theme]
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur-md supports-[backdrop-filter]:bg-canvas/70">
      <div className="mx-auto flex h-14 max-w-[88rem] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <a href="./" className="flex min-w-0 items-center gap-2.5 rounded-md">
          <Logo />
          <span className="text-[0.9375rem] font-semibold tracking-tight text-ink">Stampede</span>
          <span className="hidden truncate text-sm text-ink-faint md:inline">· retry and timeout linter</span>
        </a>
        <nav className="flex items-center gap-1" aria-label="Actions">
          <span className="hidden sm:contents">
            <CopyButton text={permalink} label="Copy link" copiedLabel="Link copied" />
          </span>
          <CopyButton text={report} label="Copy report" copiedLabel="Report copied" />
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            onClick={onCycleTheme}
            aria-label={`Theme: ${theme}. Switch to ${THEME_NEXT[theme]}.`}
            title={`Theme: ${theme}`}
            icon={<ThemeIcon size={15} />}
          />
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="Source on GitHub"
            className="grid size-7 place-items-center rounded-sm text-ink-dim transition-colors hover:bg-raised hover:text-ink"
          >
            <GitHubMark />
          </a>
        </nav>
      </div>
    </header>
  )
}
