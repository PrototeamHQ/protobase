import type { GridProps, GridSpan, LayoutChild } from '@protobase/layout'
import { cn } from '../../../lib/cn'
import { propsOf, type BlockProps } from './block-props'

const columns = { 1: '', 2: 'md:grid-cols-2', 3: 'md:grid-cols-2 xl:grid-cols-3', 4: 'sm:grid-cols-2 xl:grid-cols-4' }
// Numbers are small enough to sit two to a row on a phone; an odd last one sits alone at half width.
const statColumns = { 1: '', 2: 'grid-cols-2', 3: 'grid-cols-2 xl:grid-cols-3', 4: 'grid-cols-2 xl:grid-cols-4' }
const spans: Record<GridSpan, string> = { 1: '', 2: 'md:col-span-2', 3: 'md:col-span-2 xl:col-span-3', 4: 'sm:col-span-2 md:col-span-2 xl:col-span-4' }

const isStat = (child: LayoutChild) => typeof child === 'object' && !child.custom && child.type === 'Stat'

/** Columns that collapse to one on a phone, or two when it holds only `Stat`s; a child's `span` makes it wider. */
export const GridBlock = ({ node, children }: BlockProps) => {
  const { columns: count = 2 } = propsOf<GridProps>(node)
  const childNodes = node.children
  const stats = childNodes.length > 0 && childNodes.every(isStat)
  return (
    <div className={cn('grid grid-cols-1 gap-4', stats ? statColumns[count] : columns[count])}>
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
