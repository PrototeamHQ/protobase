import { cn } from '../lib/cn'
import { useFieldControl } from './field-control'

export type SwitchProps = { checked: boolean; onChange?: (checked: boolean) => void; label?: string; disabled?: boolean }

export const Switch = ({ checked, onChange, label, disabled }: SwitchProps) => {
  const control = useFieldControl()
  return (
    <button
      type="button"
      role="switch"
      id={control.id}
      aria-describedby={control['aria-describedby']}
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={cn('relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:cursor-default disabled:opacity-60', checked ? 'bg-primary' : 'bg-border-strong')}
    >
      <span className={cn('size-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-0.5')} />
    </button>
  )
}
