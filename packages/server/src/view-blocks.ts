import { pruneRecordBlocks, recordBlocksFindings, type CallerAccess, type Findings, type LayoutNode, type PageCheckInput } from '@protobase/layout'
import type { LayoutItemModel, TabItemModel, ViewModel } from '@protobase/schema'
import { layoutItems } from '@protobase/schema/internal'

// A record page's block trees (`l.blocks`) are checked as composed pages are when the server starts, and pruned and
// planned for each caller in /meta, inside the page's own record.

/** What is wrong with the block trees of every view's record page, and the names in them a nearer record shadows. */
export const recordBlocksOf = (views: readonly ViewModel[], input: PageCheckInput): Findings => {
  const problems: string[] = []
  const warnings: string[] = []
  for (const view of views) {
    for (const item of layoutItems(view.layout)) {
      if (item.kind !== 'blocks') continue
      const found = recordBlocksFindings(item.tree as LayoutNode, view.resource, input)
      problems.push(...found.problems.map((problem) => `View "${view.resource}" blocks: ${problem}`))
      warnings.push(...found.warnings.map((warning) => `View "${view.resource}" blocks: ${warning}`))
    }
  }
  return { problems, warnings }
}

/**
 * Throws one error listing every problem of the views' block trees, and with `strict` every shadowed name too.
 * Returns the warnings of shadowed names otherwise.
 */
export const checkRecordBlocks = (views: readonly ViewModel[], input: PageCheckInput): string[] => {
  const { problems, warnings } = recordBlocksOf(views, input)
  const failing = input.strict ? [...problems, ...warnings] : problems
  if (failing.length > 0) throw new Error(`The record pages' blocks do not match the resources:\n${failing.map((problem) => `  - ${problem}`).join('\n')}`)
  return warnings
}

/**
 * A view's record page as one caller sees it: each block tree pruned to what they may use, with the read plan of what
 * is left, and gone when nothing is, as is a tab left with nothing in it.
 */
export const withRecordBlocks = (view: ViewModel, access: CallerAccess): ViewModel => {
  const items = <T extends LayoutItemModel>(list: readonly T[]): T[] =>
    list.flatMap((item): T[] => {
      if (item.kind === 'blocks') {
        const pruned = pruneRecordBlocks(item.tree as LayoutNode, view.resource, access)
        return pruned ? [{ ...item, tree: pruned.tree, reads: pruned.reads }] : []
      }
      if (item.kind === 'tab') {
        const kept = items<TabItemModel>(item.items)
        return kept.length > 0 ? [{ ...item, items: kept }] : []
      }
      if (item.kind === 'custom' && item.fallback) return [{ ...item, fallback: items(item.fallback) }]
      return [item]
    })
  return layoutItems(view.layout).some((item) => item.kind === 'blocks') ? { ...view, layout: items(view.layout) } : view
}
