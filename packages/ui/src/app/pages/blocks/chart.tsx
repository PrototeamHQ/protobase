import type { ChartProps, Styled } from '@protobase/layout'
import { ChartView } from '../../charts/chart-view'
import { useAdminMeta } from '../../meta-gate'
import { cn } from '../../../lib/cn'
import { propsOf, type BlockProps } from './block-props'
import { CardFrame } from './card-frame'

/** Counts, sums or averages of the records that match, per value or date bucket of a field, in a card. */
export const ChartBlock = ({ node, slots, className }: BlockProps) => {
  const { resource, title, description, actions: _actions, span: _span, className: _className, ...chart } = propsOf<ChartProps & Styled>(node)
  const { resources, views } = useAdminMeta()
  const model = resources[resource]
  if (!model) return null
  return (
    <CardFrame title={title} description={description} actions={slots.actions} className={cn('h-full', className)}>
      <ChartView model={model} view={views[resource]} {...chart} />
    </CardFrame>
  )
}
