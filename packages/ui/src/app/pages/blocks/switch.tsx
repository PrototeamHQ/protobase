import { useScopeStack } from '../record-scope'
import { useStackConditions } from '../use-conditions'
import type { BlockProps } from './block-props'
import { fallbackOf } from './show'

/**
 * Its first `Match` whose `when` holds, else its `fallback`, as SolidJS's `<Switch>`; nothing while a value an earlier
 * `Match` reads loads, so a later one never shows first.
 */
export const SwitchBlock = ({ node, children, slots, className }: BlockProps) => {
  // The structure check lets a Switch hold Matches only, each one rendered child
  const matches = node.children.filter((child) => typeof child !== 'string')
  const held = useStackConditions(matches.map((match) => String(match.props.when)), useScopeStack())
  const drawn = held.findIndex((holds) => holds !== false)
  if (drawn !== -1 && held[drawn] === undefined) return null
  const shown = drawn === -1 ? fallbackOf(node, slots) : children[drawn]
  if (shown === undefined || shown === null) return null
  return className === undefined ? <>{shown}</> : <div className={className}>{shown}</div>
}

/** One branch of a `Switch`, which decides whether it is drawn. */
export const MatchBlock = ({ children }: BlockProps) => <>{children}</>
