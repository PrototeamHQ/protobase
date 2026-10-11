import { Check } from 'lucide-react'
import { cn } from '../lib/cn'

export type SwitchOption = { id: string; label: string }

export type SwitchGroupProps = {
  /** The group's name for assistive technology, such as `Organizations`. */
  label: string
  current?: SwitchOption
  others: SwitchOption[]
  rowClassName: string
  onSwitch: (id: string) => void
}

/** A group of the profile menu that switches between options: the current one checked, the others a click away. */
export const SwitchGroup = ({ label, current, others, rowClassName, onSwitch }: SwitchGroupProps) => (
  <div className="border-b py-1" role="group" aria-label={label}>
    {current && (
      <div className={cn(rowClassName, 'text-foreground hover:bg-transparent')} aria-current="true">
        <Check className="size-4" />
        <span className="truncate">{current.label}</span>
      </div>
    )}
    {others.map((option) => (
      <button key={option.id} type="button" role="menuitem" onClick={() => onSwitch(option.id)} className={rowClassName}>
        <span className="size-4" />
        <span className="truncate">{option.label}</span>
      </button>
    ))}
  </div>
)
