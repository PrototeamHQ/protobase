import { elementAt, fillProps, type LayoutNode, type ReadPlan } from '@protobase/layout'
import type { BlockQueries, BlockQuery, BlockReader } from './block-query'
import { tableQueries } from './blocks/table-query'

/** The blocks that read by themselves, by type, each with the queries it makes. */
const byType: Record<string, BlockQueries> = {
  Table: tableQueries,
}

/**
 * The queries of the blocks that read by themselves, started as the page opens with the queries of its planned reads,
 * whatever a condition says. A block inside the records of another (a read that splits) reads its own rows per record
 * as it draws, since its labels, photos and total are per record.
 */
export const blockQueries = (reader: BlockReader, tree: LayoutNode, plan: ReadPlan | undefined): BlockQuery[] =>
  (plan?.reads ?? []).flatMap((read) => {
    const node = elementAt(tree, read.block)
    if (!node || node.custom) return []
    if (read.split) return []
    const queries = byType[node.type]
    return queries ? queries(fillProps(node, { stack: [], params: reader.params }), read, reader) : []
  })
