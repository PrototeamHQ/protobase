import type { LayoutNode, ReadPlan } from '@protobase/layout'
import type { BlocksSectionModel } from '@protobase/schema'
import { PlanReadsProvider } from './plan-reads'
import { RootRecordScope, type LayoutRecord } from './record-scope'
import { RenderNode } from './render-node'
import { StartBlockQueries } from './start-block-queries'

/**
 * A block tree on the record page (`l.blocks`), drawn as a composed page's inside the page's own record: its planned
 * reads all start as it draws, their `{{@root.…}}` slots filled from the record, and its blocks read the record as `@root`.
 */
export const RecordBlocks = ({ item, scope }: { item: BlocksSectionModel; scope: LayoutRecord }) => {
  // The server sent the tree and its plan as `@protobase/layout` makes them
  const tree = item.tree as LayoutNode
  const plan = item.reads as ReadPlan | undefined
  return (
    <RootRecordScope value={scope}>
      <PlanReadsProvider tree={tree} plan={plan}>
        <StartBlockQueries tree={tree} plan={plan} />
        <RenderNode node={tree} at="" />
      </PlanReadsProvider>
    </RootRecordScope>
  )
}
