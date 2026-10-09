import type { CardProps } from '@protobase/layout'
import { propsOf, type BlockProps } from './block-props'
import { CardFrame } from './card-frame'

export const CardBlock = ({ node, children, slots }: BlockProps) => {
  const { title, description } = propsOf<CardProps>(node)
  return (
    <CardFrame title={title} description={description} actions={slots.actions} className="h-full">
      <div className="flex flex-col gap-3">{children}</div>
    </CardFrame>
  )
}
