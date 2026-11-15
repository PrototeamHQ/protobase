import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useQueries } from '@tanstack/react-query'
import { fillComponentReads, filterText, maxPerPage, planReadId, readsOf, selectOf, sortText, type LayoutNode, type LayoutValue } from '@protobase/layout'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { useClient } from '../../data/api-provider'
import { keys } from '../../data/query-keys'
import type { RouteTarget } from '../../primitives/route-link'
import { useAdminMeta } from '../meta-gate'
import { usePageParamsIfAny, usePageParamValues } from './page-params'
import { usePlannedReads } from './plan-reads'
import { useScopeStack, valueScopeOf } from './record-scope'

// A custom component that declares its reads draws them from the page's plan, which started them as the page opened:
// the component only draws. Outside a page's plan, such as in a record view, each read is made here instead.

type ComponentElement = { node: LayoutNode; at?: string }

const ComponentElementContext = createContext<ComponentElement | undefined>(undefined)

/** Puts a custom component's element, its props filled, and its place in the page's tree around it. */
export const ComponentElement = ({ node, at, children }: ComponentElement & { children: ReactNode }) => {
  const value = useMemo(() => ({ node, ...(at !== undefined && { at }) }), [node, at])
  return <ComponentElementContext.Provider value={value}>{children}</ComponentElementContext.Provider>
}

/** One read a custom component declares: the records of `model` it holds, while they load or once they failed. */
export type ComponentRead = { model: ResourceModel; view: ViewModel | undefined; rows: Record<string, unknown>[]; isPending: boolean; error: Error | null }

/** The record a component's `select` chose, by its key as the address holds it, and the page with another chosen. */
export type ComponentSelect = { chosen: string | undefined; linkTo: (key: string | undefined) => RouteTarget }

/** Each read a custom component declares, by the prop that names its resource, such as `nodes`; one naming no resource is left out. */
export type ComponentReads = Record<string, ComponentRead>

const prop = (node: LayoutNode, name: string | undefined) => (name === undefined ? undefined : (node.props[name] as LayoutValue | undefined))

const useElement = (hook: string) => {
  const element = useContext(ComponentElementContext)
  if (!element) throw new Error(`${hook} is for a custom component in a layout`)
  return element
}

/**
 * The records a custom component's declared reads hold, for a component that only draws: each from the page's planned
 * read, or read here where the page plans none. Only a custom component in a layout may call it.
 */
export const useComponentReads = (): ComponentReads => {
  const { node: written, at } = useElement('useComponentReads')
  const { resources, views } = useAdminMeta()
  const client = useClient()
  const stack = useScopeStack()
  const params = usePageParamValues()
  // A read it makes by itself fills its filter's `{{path}}`s from the records around it, as the plan's reads are
  const node = useMemo(() => fillComponentReads(written, { ...valueScopeOf(stack), params }), [written, stack, params])
  const declared = readsOf(node).flatMap(({ reads, part }) => {
    const model = resources[String(prop(node, reads.resource))]
    return model ? [{ reads, part, model }] : []
  })
  const planned = usePlannedReads(at === undefined ? [] : declared.map(({ part }) => planReadId({ block: at, part })))
  const own = useQueries({
    queries: declared.map(({ reads, model }, index) => {
      const filter = filterText(prop(node, reads.filter)) ?? ''
      const sort = sortText(prop(node, reads.sort)) ?? ''
      const limit = prop(node, reads.limit)
      const pageSize = typeof limit === 'number' ? limit : maxPerPage
      return {
        enabled: planned[index] === undefined,
        queryKey: keys.list(model.name, filter, sort, pageSize, ''),
        queryFn: () => client.list(model.name, { filter: filter || undefined, orderBy: sort || undefined, pageSize }),
      }
    }),
  })
  const reads = Object.fromEntries(
    declared.map(({ reads: names, model }, index) => {
      const fromPlan = planned[index]
      const read = own[index]!
      const loaded = fromPlan ?? { isPending: read.isPending, error: read.error, rows: read.data?.items ?? [] }
      return [names.resource, { model, view: views[model.name], rows: loaded.rows, isPending: loaded.isPending, error: loaded.error }]
    }),
  )
  return reads
}

/**
 * The record a custom component's `select` chose, and links to the page with another chosen; `undefined` when none of
 * its reads declares `select`, the element does not set it, or it is outside a composed page. Its children draw inside
 * the chosen record.
 */
export const useComponentSelect = (): ComponentSelect | undefined => {
  const { node } = useElement('useComponentSelect')
  const params = usePageParamsIfAny()
  const param = selectOf(node)?.param
  if (param === undefined || !params) return
  return { chosen: params.given[param], linkTo: (key) => params.linkTo({ [param]: key }) }
}
