import { useQueries, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { plannedRows, planReadId, type LayoutNode, type PlanRead, type PlanResult, type ReadPlan } from '@protobase/layout'
import { useClient } from '../../data/api-provider'
import { useIsXs } from '../../lib/use-media-query'
import { useAdminMeta } from '../meta-gate'
import { blockQueries } from './block-queries'
import { usePageParamValues } from './page-params'
import { planQueries } from './plan-queries'
import { useProjectUi } from './project-ui'
import { useScopeStack, valueScopeOf } from './record-scope'

// A page starts every read of its plan as it opens, each an ordinary request of its own, all at once: whatever a
// condition says and however deep a block sits. A block then draws from its read, a block inside the records of
// another the rows of its record, and reads nothing itself; a block that reads by itself finds its query already started.

type Running = { read: PlanRead; query: UseQueryResult<PlanResult> }

const PlanReadsContext = createContext<ReadonlyMap<string, Running>>(new Map())

// Starts the queries of the blocks that read by themselves as the page opens; each block then finds its own in the cache
const useBlockQueries = (tree: LayoutNode, plan: ReadPlan | undefined, params: Readonly<Record<string, string>>) => {
  const client = useClient()
  const queryClient = useQueryClient()
  const { resources, views } = useAdminMeta()
  const fieldTypes = useProjectUi().fields
  const xs = useIsXs()
  const started = useMemo(() => blockQueries({ client, queryClient, resources, views, fieldTypes, xs, params }, tree, plan), [client, queryClient, resources, views, fieldTypes, xs, params, tree, plan])
  useEffect(() => {
    for (const query of started) void query.start(queryClient)
  }, [started, queryClient])
}

/** Starts every read of `plan` that a block draws from, at once, with the page's parameters filled in. */
export const PlanReadsProvider = ({ tree, plan, children }: { tree: LayoutNode; plan: ReadPlan | undefined; children: ReactNode }) => {
  const client = useClient()
  const params = usePageParamValues()
  const planned = useMemo(() => planQueries(client, tree, plan, params), [client, tree, plan, params])
  const queries = useQueries({ queries: planned.map(({ queryKey, queryFn }) => ({ queryKey, queryFn })) })
  useBlockQueries(tree, plan, params)
  const running = new Map(planned.map(({ read }, index) => [planReadId(read), { read, query: queries[index]! }]))
  return <PlanReadsContext.Provider value={running}>{children}</PlanReadsContext.Provider>
}

/** What a block's planned read holds where it draws: its rows, or a count's total, while it loads or once it failed. */
export type Planned = { isPending: boolean; error: Error | null; rows: Record<string, unknown>[]; total?: number }

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
  return { isPending: query.isPending, error: query.error, rows, ...(query.data?.total !== undefined && { total: query.data.total }) }
}

/**
 * The planned read of the block at `at`, its place in the page's tree, with the rows of the record around it; `undefined`
 * when the page plans no read for it, so it reads by itself.
 */
export const usePlanned = (at: string | undefined): Planned | undefined => {
  const running = useContext(PlanReadsContext)
  const stack = useScopeStack()
  const params = usePageParamValues()
  return plannedAt(running, stack, params, at)
}

/** The planned reads `ids` names, by `planReadId`, each as `usePlanned` gives it. */
export const usePlannedReads = (ids: readonly string[]): Array<Planned | undefined> => {
  const running = useContext(PlanReadsContext)
  const stack = useScopeStack()
  const params = usePageParamValues()
  return ids.map((id) => plannedAt(running, stack, params, id))
}
