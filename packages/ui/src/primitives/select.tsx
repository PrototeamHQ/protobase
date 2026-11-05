import type { Ref, SelectHTMLAttributes } from 'react'
import { cn } from '../lib/cn'
import { useFieldControl } from './field-control'

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean; ref?: Ref<HTMLSelectElement> }

/** A native select as the field editors draw theirs; inside a `Field` it takes its label, help and error from it. */
export const Select = ({ invalid, className, children, ...rest }: SelectProps) => {
  const control = useFieldControl()
  return (
    <select
      {...control}
      {...(invalid && { 'aria-invalid': true })}
      className={cn('h-8 w-full min-w-0 rounded-md border bg-background px-2 shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20', invalid ? 'border-danger' : 'border-border-strong', className)}
      {...rest}
    >
      {children}
    </select>
  )
}
