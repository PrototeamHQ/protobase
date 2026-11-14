import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { pageParamValues, type LayoutNode } from '@protobase/layout'
import type { AppAddress } from '@protobase/schema'
import type { RouteTarget } from '../../primitives/route-link'
import { useAppAddress } from '../use-app-address'

/** A change of a page's parameters by name; `undefined` takes one out of the address. */
export type ParamChange = Readonly<Record<string, string | undefined>>

type PageParamsRoute = { page: string; tab?: string; given: Readonly<Record<string, string>>; values: Readonly<Record<string, string>> }

const PageParamsContext = createContext<PageParamsRoute | null>(null)

const noValues: Readonly<Record<string, string>> = {}

/** The page `name`'s address with the parameters `given` changed by `change`, leaving out each one emptied. */
export const pageAddress = (route: Pick<PageParamsRoute, 'page' | 'tab' | 'given'>, change: ParamChange = {}): AppAddress => {
  const params = Object.fromEntries(Object.entries({ ...route.given, ...change }).filter((entry): entry is [string, string] => entry[1] !== undefined && entry[1] !== ''))
  return { kind: 'page', page: route.page, ...(route.tab && { tab: route.tab }), ...(Object.keys(params).length > 0 && { params }) }
}

/** Puts a composed page's parameters around its tree: those its address `given`, and the values its `SelectInput`s hold. */
export const PageParamsProvider = ({ page, tab, tree, given = noValues, children }: { page: string; tab?: string; tree: LayoutNode; given?: Readonly<Record<string, string>>; children: ReactNode }) => {
  const values = useMemo(() => pageParamValues(tree, given), [tree, given])
  const route = useMemo(() => ({ page, ...(tab && { tab }), given, values }), [page, tab, given, values])
  return <PageParamsContext.Provider value={route}>{children}</PageParamsContext.Provider>
}

/** The values the page's `SelectInput`s hold, which `@params` reads; none outside a composed page. */
export const usePageParamValues = () => useContext(PageParamsContext)?.values ?? noValues

/**
 * A composed page's parameters as logical values, and links that change them: `values` are its `SelectInput`s', `given`
 * what its address holds, such as the key a block's `select` chose, and `linkTo` the page with a change, which keeps
 * where the page is scrolled. Components read and write them through this hook, never the query string.
 */
export const usePageParams = () => {
  const route = useContext(PageParamsContext)
  if (!route) throw new Error('A SelectInput and a select render inside a composed page, whose address holds their values')
  const { go, href } = useAppAddress()
  const linkTo = (change: ParamChange): RouteTarget => {
    const to = pageAddress(route, change)
    return { href: href(to), onFollow: () => go(to, { keepScroll: true }) }
  }
  return { values: route.values, given: route.given, linkTo }
}
