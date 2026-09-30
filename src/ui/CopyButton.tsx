import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, type ButtonProps } from './Button'

type Status = 'idle' | 'copied' | 'failed'

export interface CopyButtonProps
  extends Omit<ButtonProps, 'onClick' | 'children' | 'value'> {
  /** Resolved at click time so callers can pass expensive-to-build text. */
  text: string | (() => string)
  label?: string
  copiedLabel?: string
}

/**
 * Copies text and reports the outcome. `navigator.clipboard` rejects on
 * insecure origins and when the document is not focused, so a failure is
 * surfaced rather than silently looking like success.
 */
export function CopyButton({
  text: source,
  label = 'Copy',
  copiedLabel = 'Copied',
  size = 'sm',
  variant = 'ghost',
  ...rest
}: CopyButtonProps) {
  const [status, setStatus] = useState<Status>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = useCallback(async () => {
    const text = typeof source === 'function' ? source() : source
    try {
      await navigator.clipboard.writeText(text)
      setStatus('copied')
    } catch {
      setStatus('failed')
    }
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setStatus('idle'), 1800)
  }, [source])

  return (
    <Button
      size={size}
      variant={variant}
      onClick={copy}
      aria-live="polite"
      {...rest}
    >
      {status === 'copied'
        ? copiedLabel
        : status === 'failed'
          ? 'Press Ctrl+C'
          : label}
    </Button>
  )
}
