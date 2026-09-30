import { useId } from 'react'
import { cx } from './cx'

export interface SegmentOption<T extends string> {
  value: T
  label: string
  /** Shown in a `title` tooltip — useful when the label has to stay terse. */
  hint?: string
}

export interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<SegmentOption<T>>
  value: T
  onChange: (value: T) => void
  /** Describes the group for screen readers. */
  label: string
  size?: 'sm' | 'md'
  className?: string
}

/**
 * A radio group styled as a segmented control. Implemented with real radio
 * semantics so arrow keys move between options the way users expect, rather
 * than as a row of buttons that all read as separate controls.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'md',
  className,
}: SegmentedControlProps<T>) {
  const name = useId()
  const pad = size === 'sm' ? 'h-6 px-2 text-xs' : 'h-8 px-3 text-sm'

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cx(
        'inline-flex items-center gap-0.5 rounded-md border border-line bg-canvas p-0.5',
        className,
      )}
    >
      {options.map((opt) => {
        const selected = opt.value === value
        return (
          <label
            key={opt.value}
            title={opt.hint}
            className={cx(
              'relative inline-flex cursor-pointer items-center justify-center rounded-sm font-medium',
              'transition-[background-color,color,box-shadow] duration-150',
              'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent',
              pad,
              selected
                ? 'bg-raised text-ink shadow-e1'
                : 'text-ink-faint hover:text-ink-dim',
            )}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={selected}
              onChange={() => onChange(opt.value)}
              className="absolute inset-0 cursor-pointer appearance-none"
              data-focus-ring="custom"
            />
            <span className="pointer-events-none">{opt.label}</span>
          </label>
        )
      })}
    </div>
  )
}
