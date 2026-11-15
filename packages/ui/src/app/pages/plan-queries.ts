import { elementAt, fillPlanRead, planReadResources, type LayoutNode, type PlanRead, type ReadPlan } from '@protobase/layout'
import { keys } from '../../data/query-keys'
import { readPlanned } from '../../data/read-planned'
import type { PlanReader } from './block-query'
import { nestedRead } from './nested-plan-reads'

/** The blocks that draw from their planned read; the others still read as they draw, unless inside the records of another. */
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
 * with the page's parameters, and the record page's own record's key, filled in, none waiting for another. A `Table`, `RecordCards` or `Thread` inside the
 * records of another draws from its read too, which asks for what the block's own read would.
 */
export const planQueries = (reader: PlanReader, tree: LayoutNode, plan: ReadPlan | undefined) =>
  (plan?.reads ?? []).flatMap((planned) => {
    const node = elementAt(tree, planned.block)
    const nested = node && nestedRead(node, planned, reader)
    if (!nested && !runs(tree, planned)) return []
    const read = fillPlanRead(nested?.read ?? planned, { params: reader.params, ...(reader.root && { root: reader.root }) })
    const extras = nested?.extras ?? {}
    const queryFn = async () => {
      const page = await readPlanned(reader.client, read, extras)
      await nested?.then?.(page)
      return page
    }
    // What it asks for beside its rows depends on the screen, such as a phone's columns
    return [{ read, queryKey: [...keys.planRead(planReadResources(planned, plan!), read), extras], queryFn }]
  })
