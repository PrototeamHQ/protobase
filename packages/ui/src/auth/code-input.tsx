import { cn } from '../lib/cn'
import { Input, type InputProps } from '../primitives/input'

/** A 6-digit one-time code field: digits on phone keyboards, filled from the mail app where the system offers it. */
export const CodeInput = ({ className, ...rest }: Omit<InputProps, 'type' | 'inputMode' | 'autoComplete'>) => (
  <Input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} spellCheck={false} className={cn('min-h-6 font-mono tracking-[0.3em]', className)} {...rest} />
)
