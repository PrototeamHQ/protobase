import { Loader2 } from 'lucide-react'
import { cn } from '../lib/cn'

export const Spinner = ({ className }: { className?: string }) => (
  <Loader2 aria-label="Loading" className={cn('size-4 animate-spin', className)} />
)
