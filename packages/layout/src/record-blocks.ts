import { treeFindings, type Findings, type PageCheckInput } from './check-page'
import { structureProblems } from './check-structure'
import type { LayoutNode } from './node'
import { pruneTree, type CallerAccess } from './prune-page'
import type { ReadPlan } from './read-plan'

// A record page's block tree (`l.blocks`) is checked and planned as a composed page's, inside the page's own record:
// `@root`, and the bottom of the stack its bare names search. Its key comes from the address, so no read waits for it.

/** What is wrong with a block tree on the record page of `resource`, and the names in it a nearer record shadows. */
export const recordBlocksFindings = (tree: LayoutNode, resource: string, input: PageCheckInput): Findings => {
  const structure = structureProblems(tree, { stack: [], root: resource })
  if (structure.length > 0) return { problems: structure, warnings: [] }
  return treeFindings(tree, { ...input, root: resource })
}

/** A block tree on the record page of `resource` as one caller may see it, with its read plan; `undefined` when nothing of it is left. */
export const pruneRecordBlocks = (tree: LayoutNode, resource: string, access: CallerAccess): { tree: LayoutNode; reads: ReadPlan } | undefined => pruneTree(tree, access, resource)
