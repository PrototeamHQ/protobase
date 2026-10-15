import { useEffect, useState } from 'react'
import { cn } from '../lib/cn'
import { useDebounced } from '../lib/use-debounced'
import type { RangeConfig } from './filter-config'
import { barInRange, fraction, moveThumb } from './range-math'
import './range-slider.css'

export type RangeFilterProps = { config: RangeConfig; value?: [number, number]; onChange: (value: [number, number] | undefined) => void }

/** How long a thumb rests, mid-drag or between arrow keys, before the list filters on it. */
export const rangeSettleMs = 1000

export const RangeFilter = ({ config, value, onChange }: RangeFilterProps) => {
  const { min, max, step, histogram, format } = config
  // The thumbs follow a drag as it happens; the list filters once they are let go of or rest, so it does not reflow under the pointer
  const [draft, setDraft] = useState<[number, number]>()
  const selected = draft ?? value ?? [min, max]
  const peak = Math.max(...histogram)
  const commit = () => {
    if (!draft) return
    setDraft(undefined)
    onChange(draft[0] === min && draft[1] === max ? undefined : draft)
  }
  const rested = useDebounced(draft, rangeSettleMs)
  useEffect(() => {
    if (rested) commit()
  }, [rested])

  return (
    <div className="w-full">
      <div className="px-[7px]">
        {histogram.length > 0 && (
          <div className="mb-1 flex h-12 items-end gap-0.5">
            {histogram.map((count, index) => (
              <span
                key={index}
                className={cn('flex-1 rounded-t-sm', barInRange(index, histogram.length, min, max, selected) ? 'bg-primary/70' : 'bg-border')}
                style={{ height: `${Math.max(6, (count / peak) * 100)}%` }}
              />
            ))}
          </div>
        )}
        <div className="relative h-4">
          <span className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-border" />
          <span
            className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-primary"
            style={{ left: `${fraction(selected[0], min, max) * 100}%`, right: `${100 - fraction(selected[1], min, max) * 100}%` }}
          />
        </div>
      </div>
      <div className="relative -mt-4 h-4">
        {([0, 1] as const).map((thumb) => (
          <input
            key={thumb}
            type="range"
            className="pb-range"
            aria-label={`${config.label} ${thumb === 0 ? 'minimum' : 'maximum'}`}
            min={min}
            max={max}
            step={step}
            value={selected[thumb]}
            onChange={(event) => setDraft(moveThumb(selected, thumb, Number(event.target.value)))}
            onPointerUp={commit}
            onTouchEnd={commit}
            onBlur={commit}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs tabular-nums text-muted-foreground">
        <span>{format(selected[0])}</span>
        <span>{format(selected[1])}</span>
      </div>
    </div>
  )
}
