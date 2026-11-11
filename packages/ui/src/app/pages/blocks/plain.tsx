import type { TextProps } from '@protobase/layout'
import { cn } from '../../../lib/cn'
import { propsOf, type BlockProps } from './block-props'

// The plain elements look like nothing of their own: their classes say how they look.

/** An element of its own, such as a panel or a banner. */
export const BoxBlock = ({ children, className }: BlockProps) => <div className={className}>{children}</div>

/** Its children side by side. */
export const RowBlock = ({ children, className }: BlockProps) => <div className={cn('flex', className)}>{children}</div>

/** Its children one under another. */
export const ColumnBlock = ({ children, className }: BlockProps) => <div className={cn('flex flex-col', className)}>{children}</div>

/** Text and links in it, as a paragraph, a piece of a line or a heading. */
export const TextBlock = ({ node, children, className }: BlockProps) => {
  const { as: Tag = 'p' } = propsOf<TextProps>(node)
  return <Tag className={className}>{children}</Tag>
}
