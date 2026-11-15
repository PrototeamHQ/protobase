import { elementAt, fillProps, type LayoutNode, type ReadPlan } from '@protobase/layout'
import { blockQuery, type BlockQueries, type BlockQuery, type BlockReader } from './block-query'
import { chartQueries } from './blocks/chart-query'
import { recordCardsQueries } from './blocks/record-cards-query'
import { tableQueries } from './blocks/table-query'
import { threadQueries } from './blocks/thread-query'
import { countQuery } from './use-layout-data'

/** The blocks that read by themselves, by type, each with the queries it makes. */
const byType: Record<string, BlockQueries> = {
  Table: tableQueries,
  Chart: chartQueries,
  RecordCards: recordCardsQueries,
  Thread: threadQueries,
}

// A `<resource>.count` a condition names counts all of the resource's records the reader may see, as `useStackConditions` reads it
const conditionCount: BlockQueries = (_node, read, { client, resources }) => {
  const model = resources[read.resource]
  return model ? [blockQuery(countQuery(client, model))] : []
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
    if (read.part === 'condition') return conditionCount(node, read, reader)
    if (read.split) return []
    const queries = byType[node.type]
    return queries ? queries(fillProps(node, { stack: [], params: reader.params }), read, reader) : []
  })
