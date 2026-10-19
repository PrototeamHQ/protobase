import { ArrowUpDown, Check } from 'lucide-react'
import { Button } from '../../primitives/button'
import { text } from './messages'

/** The button that turns reordering by hand on, as **Reorder**, and off again, as **Done**; with `iconOnly` its icon alone. */
export const ReorderButton = ({ sorting, onChange, size, iconOnly = false }: { sorting: boolean; onChange: (sorting: boolean) => void; size?: 'sm' | 'md'; iconOnly?: boolean }) => {
  const label = sorting ? text('done') : text('reorder')
  return (
    <Button size={size} variant={sorting ? 'primary' : 'secondary'} onClick={() => onChange(!sorting)} {...(iconOnly && { 'aria-label': label, title: label })}>
      {sorting ? <Check className="size-3.5" /> : <ArrowUpDown className="size-3.5" />}
      {!iconOnly && label}
    </Button>
  )
}
