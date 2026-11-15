import { elementAt, fillPlanRead, planReadResources, type LayoutNode, type PlanRead, type ReadPlan } from '@protobase/layout'
import type { Client } from '@protobase/client'
import { keys } from '../../data/query-keys'
import { readPlanned } from '../../data/read-planned'

/** The blocks that draw from their planned read; the others still read as they draw. */
const drawsFromPlan = new Set(['RecordCard', 'CardRow', 'Stat', 'ReferenceManyField', 'ReferenceArrayField', 'ReferenceField'])

// A block's own read, as the blocks that draw from the plan make it, and every read a custom component declares; the
// row a `select` chose is read where it draws
const runs = (tree: LayoutNode, read: PlanRead) => {
  const node = elementAt(tree, read.block)
  if (node?.custom) return node.reads !== undefined && read.part !== 'chosen'
  return read.part === undefined && node !== undefined && drawsFromPlan.has(node.type)
}

/**
 * The queries a page starts as it opens, one per planned read a block draws from, each an ordinary request of its own
 * with the page's parameters filled in, none waiting for another.
 */
export const planQueries = (client: Client, tree: LayoutNode, plan: ReadPlan | undefined, params: Readonly<Record<string, string>>) =>
  (plan?.reads ?? [])
    .filter((read) => runs(tree, read))
    .map((planned) => {
      const read = fillPlanRead(planned, { params })
      return { read, queryKey: keys.planRead(planReadResources(planned, plan!), read), queryFn: () => readPlanned(client, read) }
    })
