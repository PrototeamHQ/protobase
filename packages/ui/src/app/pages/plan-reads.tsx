import { useQueries, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react'
import { plannedRows, planReadId, type LayoutNode, type PlanRead, type ReadPlan } from '@protobase/layout'
import { useClient } from '../../data/api-provider'
import type { PlannedPage } from '../../data/read-planned'
import { useIsXs } from '../../lib/use-media-query'
import { useAdminMeta } from '../meta-gate'
import { usePageParamValues } from './page-params'
import { planQueries } from './plan-queries'
import type { Planned } from './planned'
import { useProjectUi } from './project-ui'
import { samePlanned } from './same-planned'
import { rootRecordOf, useScopeStack, valueScopeOf } from './record-scope'

// A page starts every read of its plan as it opens, each an ordinary request of its own, all at once: whatever a
// condition says and however deep a block sits. A block then draws from its read, a block inside the records of
// another the rows of its record, and reads nothing itself.

type Running = { read: PlanRead; query: UseQueryResult<PlannedPage> }

const PlanReadsContext = createContext<ReadonlyMap<string, Running>>(new Map())

/** Starts every read of `plan` that a block draws from, at once, with the page's parameters filled in. */
export const PlanReadsProvider = ({ tree, plan, children }: { tree: LayoutNode; plan: ReadPlan | undefined; children: ReactNode }) => {
  const client = useClient()
  const queryClient = useQueryClient()
  const { resources, views } = useAdminMeta()
  const fieldTypes = useProjectUi().fields
  const xs = useIsXs()
  const params = usePageParamValues()
  // On a record page, the page's own record fills the `{{@root.…}}` slots
  const root = rootRecordOf(useScopeStack())
  const planned = useMemo(() => planQueries({ client, queryClient, resources, views, fieldTypes, xs, params, ...(root && { root }) }, tree, plan), [client, queryClient, resources, views, fieldTypes, xs, params, root, tree, plan])
  const queries = useQueries({ queries: planned.map(({ queryKey, queryFn }) => ({ queryKey, queryFn })) })
  const running = new Map(planned.map(({ read }, index) => [planReadId(read), { read, query: queries[index]! }]))
  return <PlanReadsContext.Provider value={running}>{children}</PlanReadsContext.Provider>
}

// What the read `id` holds where it draws, with the rows of the record around it; `undefined` when the page plans none
const plannedAt = (running: ReadonlyMap<string, Running>, stack: ReturnType<typeof useScopeStack>, params: Readonly<Record<string, string>>, id: string | undefined): Planned | undefined => {
  const found = id === undefined ? undefined : running.get(id)
  if (!found) return
  const { read, query } = found
  // A record the page's plan did not read, such as one of a list's later pages, has no rows in a nested read: the
  // block reads its own
  const nearest = stack.at(-1)
  if (read.split && !(nearest && 'model' in nearest && nearest.planned)) return
  const rows = query.data ? plannedRows(read, query.data.rows, { ...valueScopeOf(stack), params }) : []
  const { total, labels, photos } = query.data ?? {}
  return { isPending: query.isPending, error: query.error, rows, ...(total !== undefined && { total }), ...(labels && { labels }), ...(photos && { photos }) }
}

/**
 * The planned read of the block at `at`, its place in the page's tree, with the rows of the record around it; `undefined`
 * when the page plans no read for it, so it reads by itself.
 */
export const usePlanned = (at: string | undefined): Planned | undefined => usePlannedReads([at])[0]

/**
 * The planned reads `ids` names, by `planReadId`, each as `usePlanned` gives it: the same as the render before while
 * it holds the same rows, so what a block draws from them is drawn again only once they change.
 */
export const usePlannedReads = (ids: ReadonlyArray<string | undefined>): Array<Planned | undefined> => {
  const running = useContext(PlanReadsContext)
  const stack = useScopeStack()
  const params = usePageParamValues()
  const before = useRef<Array<Planned | undefined>>([])
  const now = ids.map((id, index) => samePlanned(before.current[index], plannedAt(running, stack, params, id)))
  before.current = now
  return now
}
