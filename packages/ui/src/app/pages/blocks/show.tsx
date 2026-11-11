import { type ShowProps } from '@protobase/layout'
import { useLayoutRecord } from '../record-scope'
import { useConditions } from '../use-conditions'
import { propsOf, type BlockProps } from './block-props'

/** Its children while `when` holds: fields of the record around it, and `<resource>.count` for any resource. */
export const ShowBlock = ({ node, children, className }: BlockProps) => {
  const { when } = propsOf<ShowProps>(node)
  const [shown] = useConditions([when], useLayoutRecord())
  if (!shown) return null
  // Its classes go on an element around its children while it shows, and on nothing while it does not
  return className === undefined ? <>{children}</> : <div className={className}>{children}</div>
}
