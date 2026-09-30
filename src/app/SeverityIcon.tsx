import { CircleAlert, CircleHelp, Info, OctagonAlert, TriangleAlert } from 'lucide-react'
import type { Severity, Verdict } from '../domain/model'

/** Each severity has its own silhouette, so it never depends on hue alone. */
export function SeverityIcon({
  severity,
  verdict = 'fail',
  size = 16,
  className,
}: {
  severity: Severity
  verdict?: Verdict
  size?: number
  className?: string
}) {
  const props = { size, className, 'aria-hidden': true as const }
  if (verdict === 'needs-context') return <CircleHelp {...props} />
  switch (severity) {
    case 'critical':
      return <OctagonAlert {...props} />
    case 'danger':
      return <TriangleAlert {...props} />
    case 'caution':
      return <CircleAlert {...props} />
    case 'info':
      return <Info {...props} />
  }
}
