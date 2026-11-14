import { fillProps, type LayoutNode } from '@protobase/layout'
import { useScopeStack, valueScopeOf, type ScopeFrame } from '../record-scope'
import { useStackConditions } from '../use-conditions'
import type { BlockProps } from './block-props'
import { fallbackOf } from './show'

/**
 * The `when` of each `Match`, its `{{path}}`s filled from the records around the Switch as each Match fills its own when
 * it draws. The structure check lets a Switch hold Matches only, each one rendered child.
 */
export const matchConditions = (children: LayoutNode['children'], stack: readonly ScopeFrame[]) =>
  children.flatMap((child) => (typeof child === 'string' ? [] : [String(fillProps(child, valueScopeOf(stack)).props.when)]))

/**
 * Its first `Match` whose `when` holds, else its `fallback`, as SolidJS's `<Switch>`; nothing while a value an earlier
 * `Match` reads loads, so a later one never shows first.
 */
export const SwitchBlock = ({ node, children, slots, className }: BlockProps) => {
  const stack = useScopeStack()
  const held = useStackConditions(matchConditions(node.children, stack), stack)
  const drawn = held.findIndex((holds) => holds !== false)
  if (drawn !== -1 && held[drawn] === undefined) return null
  const shown = drawn === -1 ? fallbackOf(node, slots) : children[drawn]
  if (shown === undefined || shown === null) return null
  return className === undefined ? <>{shown}</> : <div className={className}>{shown}</div>
}

/** One branch of a `Switch`, which decides whether it is drawn. */
export const MatchBlock = ({ children }: BlockProps) => <>{children}</>
