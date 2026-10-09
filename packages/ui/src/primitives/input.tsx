import type { InputHTMLAttributes, ReactNode, Ref } from 'react'
import { cn } from '../lib/cn'

export type InputProps = InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement>; leading?: ReactNode; trailing?: ReactNode; invalid?: boolean; wrapperClassName?: string }

export const Input = ({ leading, trailing, invalid, className, wrapperClassName, ...rest }: InputProps) => (
  <span
    className={cn(
      'flex h-8 items-center gap-2 rounded-md border bg-background px-2.5 text-muted-foreground shadow-sm focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20',
      invalid ? 'border-danger' : 'border-border-strong',
      wrapperClassName,
    )}
  >
    {leading}
    <input className={cn('min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-faint-foreground', className)} {...rest} />
    {trailing}
  </span>
)
