import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../lib/cn'
import { Spinner } from './spinner'

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  loading?: boolean
}

const variants = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary-hover shadow-sm',
  secondary: 'bg-background text-foreground border border-border-strong hover:bg-muted shadow-sm',
  ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
  danger: 'bg-background text-danger-text border border-border-strong hover:bg-danger-soft shadow-sm',
}

const sizes = { sm: 'h-7 px-2.5 text-xs gap-1.5', md: 'h-8 px-3 text-[13px] gap-2' }

export const Button = ({ variant = 'secondary', size = 'md', loading, className, children, disabled, ...rest }: ButtonProps) => (
  <button
    type="button"
    disabled={disabled || loading}
    className={cn(
      'inline-flex shrink-0 items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60 disabled:cursor-default',
      variants[variant],
      sizes[size],
      className,
    )}
    {...rest}
  >
    {loading && <Spinner className="size-3.5" />}
    {children}
  </button>
)
