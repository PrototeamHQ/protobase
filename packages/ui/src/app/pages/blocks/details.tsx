import type { DetailsProps } from '@protobase/layout'
import { cn } from '../../../lib/cn'
import { propsOf, type BlockProps } from './block-props'

/** HTML's <details>: the browser opens and closes it on a click of its summary, with no script. */
export const DetailsBlock = ({ node, children, className }: BlockProps) => {
  const { open } = propsOf<DetailsProps>(node)
  return (
    <details open={open} className={cn('[&[open]>summary]:mb-2', className)}>
      {children}
    </details>
  )
}

/** The line of a `Details` that is always shown, which opens and closes it. */
export const SummaryBlock = ({ children, className }: BlockProps) => <summary className={cn('cursor-pointer font-medium', className)}>{children}</summary>
