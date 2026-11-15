import { referenceManyRead, scopeLookup, type ReferenceManyFieldProps } from '@protobase/layout'
import { useAdminMeta } from '../../meta-gate'
import { ListBody } from '../layout-list'
import { useScopeStack, valueScopeOf } from '../record-scope'
import { usePlanned } from '../plan-reads'
import { useRelatedList } from '../use-related-list'
import { propsOf, type BlockProps } from './block-props'

/**
 * The records of `reference` whose `target` holds the record's `source`, as a list its children draw, as react-admin's
 * ReferenceManyField: its key descending unless `sort` says otherwise, `empty` when none match, and with
 * `pagination="more"` a button that reads the next page. On a page, its rows come from the page's planned read.
 */
export const ReferenceManyFieldBlock = ({ node, at, children }: BlockProps) => {
  const props = propsOf<ReferenceManyFieldProps>(node)
  const model = useAdminMeta().resources[props.reference]
  const lookup = scopeLookup(valueScopeOf(useScopeStack()))
  const planned = usePlanned(at)
  if (!model) return null
  return (
    <RelatedList model={model} {...referenceManyRead(props, model.primaryKey[0]!, lookup)} more={props.pagination === 'more'} empty={props.empty} {...(planned && { planned })}>
      {children}
    </RelatedList>
  )
}

type ListProps = Parameters<typeof useRelatedList>[0] & { empty?: string; children: BlockProps['children'] }

/** A list block's read and what it draws of it. */
export const RelatedList = ({ empty, children, ...request }: ListProps) => {
  const { read, list } = useRelatedList(request)
  return (
    <ListBody read={read} list={list} empty={empty}>
      {children}
    </ListBody>
  )
}
