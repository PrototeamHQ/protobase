import { Loader2 } from 'lucide-react'
import { cn } from '../lib/cn'
import { text } from './messages'

/** A spinning loader, named "Loading", or `hidden` from assistive technology where what it sits in already says it is busy. */
export const Spinner = ({ className, hidden = false }: { className?: string; hidden?: boolean }) => (
  <Loader2 {...(hidden ? { 'aria-hidden': true } : { 'aria-label': text('loading') })} className={cn('size-4 animate-spin', className)} />
)
