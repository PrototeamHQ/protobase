import type { ReactNode } from 'react'
import { selectOf, type LayoutNode } from '@protobase/layout'
import { GuardedParams } from '../guarded-params'
import { useAdminMeta } from '../meta-gate'
import { ChosenRecord } from './blocks/chosen-record'
import { usePageParamsIfAny } from './page-params'

/**
 * A custom component's children inside the record its `select` chose, read by the key the page's address holds;
 * nothing while none is chosen. Without `select`, its children as they are.
 */
export const CustomChosen = ({ node, children }: { node: LayoutNode; children: ReactNode }) => {
  const selection = selectOf(node)
  const params = usePageParamsIfAny()
  const { resources } = useAdminMeta()
  if (!selection || !params) return children
  const key = params.given[selection.param]
  const model = selection.resource === undefined ? undefined : resources[selection.resource]
  if (key === undefined || !model) return null
  // A form under it asks before another choice replaces it
  return (
    <GuardedParams name={selection.param}>
      <ChosenRecord key={key} model={model} query={{ key }} className="">
        {children}
      </ChosenRecord>
    </GuardedParams>
  )
}
