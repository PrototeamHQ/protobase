import type { ReactNode } from 'react'
import { type ShowProps } from '@protobase/layout'
import { useScopeStack } from '../record-scope'
import { useStackConditions } from '../use-conditions'
import { propsOf, type BlockProps } from './block-props'

/** A `fallback` as it draws: text as it is, elements as they were rendered into the slot of that name. */
export const fallbackOf = (node: BlockProps['node'], slots: BlockProps['slots']): ReactNode => (typeof node.props.fallback === 'string' ? node.props.fallback : slots.fallback)

/**
 * Its children while `when` holds, else its `fallback`, as SolidJS's `<Show>`: fields of the records around it, and
 * `<resource>.count` for any resource. Nothing while a value the condition reads loads.
 */
export const ShowBlock = ({ node, children, slots, className }: BlockProps) => {
  const { when } = propsOf<ShowProps>(node)
  const [shown] = useStackConditions([when], useScopeStack())
  if (shown === undefined) return null
  const drawn = shown ? children : fallbackOf(node, slots)
  if (drawn === undefined || drawn === null) return null
  // Its classes go on an element around what it draws, and on nothing while it draws nothing
  return className === undefined ? <>{drawn}</> : <div className={className}>{drawn}</div>
}
