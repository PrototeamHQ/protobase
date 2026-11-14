import { scopeValue, type ArrayFieldProps } from '@protobase/layout'
import { useMemo } from 'react'
import { LayoutListScope } from '../layout-list'
import { useScopeStack, valueScopeOf } from '../record-scope'
import { propsOf, type BlockProps } from './block-props'

/** The items of a JSON list the record around it holds, as a list its children draw, as react-admin's ArrayField. */
export const ArrayFieldBlock = ({ node, children }: BlockProps) => {
  const { source } = propsOf<ArrayFieldProps>(node)
  const held = scopeValue(valueScopeOf(useScopeStack()), source)
  const list = useMemo(() => ({ items: Array.isArray(held) ? held : [] }), [held])
  return <LayoutListScope value={list}>{children}</LayoutListScope>
}
