import type { CardProps } from '@protobase/layout'
import { cn } from '../../../lib/cn'
import { propsOf, type BlockProps } from './block-props'
import { CardFrame } from './card-frame'

export const CardBlock = ({ node, children, slots, className }: BlockProps) => {
  const { title, description } = propsOf<CardProps>(node)
  return (
    <CardFrame title={title} description={description} actions={slots.actions} className={cn('h-full', className)}>
      <div className="flex flex-col gap-3">{children}</div>
    </CardFrame>
  )
}
