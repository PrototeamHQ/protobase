import { cn } from '../lib/cn'
import type { RangeConfig } from './filter-config'
import { barInRange, fraction, moveThumb } from './range-math'
import './range-slider.css'

export type RangeFilterProps = { config: RangeConfig; value?: [number, number]; onChange: (value: [number, number] | undefined) => void }

export const RangeFilter = ({ config, value, onChange }: RangeFilterProps) => {
  const { min, max, step, histogram, format } = config
  const selected = value ?? [min, max]
  const peak = Math.max(...histogram)
  const commit = (next: [number, number]) => onChange(next[0] === min && next[1] === max ? undefined : next)

  return (
    <div className="w-full">
      <div className="px-[7px]">
        <div className="flex h-12 items-end gap-0.5">
          {histogram.map((count, index) => (
            <span
              key={index}
              className={cn('flex-1 rounded-t-sm', barInRange(index, histogram.length, min, max, selected) ? 'bg-primary/70' : 'bg-border')}
              style={{ height: `${Math.max(6, (count / peak) * 100)}%` }}
            />
          ))}
        </div>
        <div className="relative mt-1 h-4">
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
            onChange={(event) => commit(moveThumb(selected, thumb, Number(event.target.value)))}
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
