import { type ShowProps } from '@protobase/layout'
import { useLayoutRecord } from '../record-scope'
import { useConditions } from '../use-conditions'
import { propsOf, type BlockProps } from './block-props'

/** Its children while `when` holds: fields of the record around it, and `<resource>.count` for any resource. */
export const ShowBlock = ({ node, children }: BlockProps) => {
  const { when } = propsOf<ShowProps>(node)
  const [shown] = useConditions([when], useLayoutRecord())
  return shown ? <>{children}</> : null
}
