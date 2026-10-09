import type { GridProps, GridSpan } from '@protobase/layout'
import { cn } from '../../../lib/cn'
import { propsOf, type BlockProps } from './block-props'

const columns = { 1: '', 2: 'md:grid-cols-2', 3: 'md:grid-cols-2 xl:grid-cols-3', 4: 'sm:grid-cols-2 xl:grid-cols-4' }
const spans: Record<GridSpan, string> = { 1: '', 2: 'md:col-span-2', 3: 'md:col-span-2 xl:col-span-3', 4: 'sm:col-span-2 md:col-span-2 xl:col-span-4' }

/** Columns that collapse to one on a phone; a child's `span` makes it wider. */
export const GridBlock = ({ node, children }: BlockProps) => {
  const { columns: count = 2 } = propsOf<GridProps>(node)
  const childNodes = node.children
  return (
    <div className={cn('grid grid-cols-1 gap-4', columns[count])}>
      {children.map((child, index) => {
        const element = childNodes[index]
        const span = typeof element === 'object' ? (element.props.span as GridSpan | undefined) : undefined
        return (
          <div key={index} className={cn('min-w-0', span && spans[span])}>
            {child}
          </div>
        )
      })}
    </div>
  )
}
