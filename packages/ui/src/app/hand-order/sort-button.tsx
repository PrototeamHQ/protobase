import { ArrowUpDown, Check } from 'lucide-react'
import { Button } from '../../primitives/button'

/** The button that turns sorting by hand on, as **Sort**, and off again, as **Done**; with `iconOnly` its icon alone. */
export const SortButton = ({ sorting, onChange, size, iconOnly = false }: { sorting: boolean; onChange: (sorting: boolean) => void; size?: 'sm' | 'md'; iconOnly?: boolean }) => {
  const label = sorting ? 'Done' : 'Sort'
  return (
    <Button size={size} variant={sorting ? 'primary' : 'secondary'} onClick={() => onChange(!sorting)} {...(iconOnly && { 'aria-label': label, title: label })}>
      {sorting ? <Check className="size-3.5" /> : <ArrowUpDown className="size-3.5" />}
      {!iconOnly && label}
    </Button>
  )
}
