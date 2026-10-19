import { Loader2 } from 'lucide-react'
import { cn } from '../lib/cn'
import { text } from './messages'

export const Spinner = ({ className }: { className?: string }) => (
  <Loader2 aria-label={text('loading')} className={cn('size-4 animate-spin', className)} />
)
