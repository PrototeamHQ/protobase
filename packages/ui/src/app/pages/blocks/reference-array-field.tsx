import { referenceArrayRead, scopeLookup, type ReferenceArrayFieldProps } from '@protobase/layout'
import { useAdminMeta } from '../../meta-gate'
import { useScopeStack, valueScopeOf } from '../record-scope'
import { usePlanned } from '../plan-reads'
import { propsOf, type BlockProps } from './block-props'
import { RelatedList } from './reference-many-field'

/**
 * The records of `reference` whose keys the record's `source`, a JSON list, holds, as a list its children draw, as
 * react-admin's ReferenceArrayField: one read with `in()`, its filter and sort, by default its key descending; on a
 * page, the rows of the page's planned read.
 */
export const ReferenceArrayFieldBlock = ({ node, at, children }: BlockProps) => {
  const props = propsOf<ReferenceArrayFieldProps>(node)
  const model = useAdminMeta().resources[props.reference]
  const lookup = scopeLookup(valueScopeOf(useScopeStack()))
  const planned = usePlanned(at)
  if (!model) return null
  return (
    <RelatedList model={model} {...referenceArrayRead(props, model.primaryKey[0]!, lookup)} more={false} empty={props.empty} {...(planned && { planned })}>
      {children}
    </RelatedList>
  )
}
