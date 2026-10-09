import { cn } from '../lib/cn'

export const orderStatusOptions = [
  { value: 'open', label: 'Open', description: 'Waiting for payment. Stock is reserved.' },
  { value: 'paid', label: 'Paid', description: 'Payment received. Ready to be picked.' },
  { value: 'shipped', label: 'Shipped', description: 'Handed to the carrier. Customer is notified.' },
] as const

export type OrderStatusValue = (typeof orderStatusOptions)[number]['value']

export const OrderStatusChoice = ({ value, onChange }: { value: OrderStatusValue; onChange: (value: OrderStatusValue) => void }) => (
  <div role="radiogroup" aria-label="Status" className="grid grid-cols-3 gap-3">
    {orderStatusOptions.map((option) => (
      <button
        key={option.value}
        type="button"
        role="radio"
        aria-checked={option.value === value}
        onClick={() => onChange(option.value)}
        className={cn('rounded-lg border p-3 text-left transition-colors', option.value === value ? 'border-primary bg-primary-soft' : 'bg-background hover:bg-surface')}
      >
        <span className={cn('block text-[13px] font-medium', option.value === value && 'text-primary-text')}>{option.label}</span>
        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{option.description}</span>
      </button>
    ))}
  </div>
)
