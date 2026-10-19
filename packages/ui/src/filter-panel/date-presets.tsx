import { cn } from '../lib/cn'
import { datePresetLabel, defaultDatePresets, type DatePresetId } from './filter-config'
import { text } from './messages'

export type DatePresetsProps = { value?: DatePresetId; presets?: DatePresetId[]; onChange: (value: DatePresetId | undefined) => void }

export const DatePresets = ({ value, presets = defaultDatePresets, onChange }: DatePresetsProps) => (
  <div className="flex flex-wrap gap-1.5">
    {presets.map((id) => {
      const label = datePresetLabel(id)
      return (
        <button
          key={id}
          type="button"
          disabled={!label}
          title={label ? undefined : text('unknownPreset', id)}
          onClick={() => onChange(value === id ? undefined : id)}
          className={cn(
            'h-7 rounded-md border px-2.5 text-xs font-medium transition-colors',
            !label && 'border-dashed text-danger-text',
            value === id ? 'border-primary-border bg-primary-soft text-primary-text' : 'border-border-strong bg-background text-muted-foreground hover:bg-muted',
          )}
        >
          {label ?? text('unsupported', id)}
        </button>
      )
    })}
  </div>
)
