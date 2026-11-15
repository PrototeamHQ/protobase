import type { Graph } from '../definition-graph'
import { holdsSteps } from '../definition'
import type { BreakNode, DataEdge, DataGraph, PureNode } from './data-graph'
import type { InputPin, OutputPin } from './node-pins'
import { outHandle } from './pure-ids'
import { expressionTextHeight, pinnedHeight, pureWidth, rowHeight, shownInputs, stepWidth } from './pin-layout'

/** A node's size, as the layout places it. */
export type Size = { width: number; height: number }

// A Break's or a Make's title is one line
const pureHeader = 34

// A Select's cases each hold two values side by side
const selectWidth = 280

// A Make shows every field it builds, as Blueprints draw one, unless it has more than this
const makeFieldsShown = 8

/** The inputs a Make shows and how many it folds away, a condition node all of its own; a Break takes no inputs of its own. */
export const pureInputs = (pure: PureNode, open: boolean): { shown: InputPin[]; folded: number } => {
  if (pure.kind === 'condition') return { shown: pure.inputs, folded: 0 }
  return pure.kind === 'make' ? shownInputs(pure.inputs, open || pure.inputs.length <= makeFieldsShown) : { shown: [], folded: 0 }
}

/**
 * The fields a Break shows: those something reads, through a wire or an expression, all of them once it is opened or
 * while nothing reads any; with how many it folds away, and whether it has a row to fold or open them.
 */
export const breakOutputs = (pure: BreakNode, edges: readonly DataEdge[], open: boolean): { shown: OutputPin[]; folded: number; foldable: boolean } => {
  const read = new Set(edges.filter((edge) => edge.source === pure.id).map((edge) => edge.sourceHandle))
  const reads = pure.outputs.filter((pin) => read.has(outHandle(pin.path)))
  const foldable = reads.length > 0 && reads.length < pure.outputs.length
  if (open || !foldable) return { shown: pure.outputs, folded: 0, foldable }
  return { shown: reads, folded: pure.outputs.length - reads.length, foldable }
}

// An Expression's text above the values it reads, and the space between them
const expressionHeight = (reads: number) => pureHeader + 4 + expressionTextHeight + 4 + reads * rowHeight + 8

/**
 * Every node's size by its id: a step's or the trigger's by the pins it shows, a Break's or a Make's too; a Map or a
 * Block is left out, as the layout sizes it around the states inside it.
 */
export const nodeSizes = (graph: Graph, data: DataGraph, open: ReadonlySet<string>): Map<string, Size> => {
  const sizes = new Map<string, Size>()
  for (const node of graph.nodes) {
    if (node.kind === 'state' && holdsSteps(node.state)) continue
    const { shown, folded } = shownInputs(data.inputs.get(node.id) ?? [], open.has(node.id))
    sizes.set(node.id, { width: stepWidth, height: pinnedHeight(shown.length, data.outputs.get(node.id) ?? [], folded > 0 || open.has(node.id)) })
  }
  for (const pure of data.pure) {
    if (pure.kind === 'condition' && pure.part.kind === 'expression') {
      sizes.set(pure.id, { width: pureWidth, height: expressionHeight(pure.inputs.length) })
      continue
    }
    // A Select: the value it looks at, a row per case, what it gives otherwise, and the row that adds a case
    if (pure.kind === 'select') {
      sizes.set(pure.id, { width: selectWidth, height: pinnedHeight(pure.part.cases.length + 3, 1, false, pureHeader) })
      continue
    }
    if (pure.kind === 'break') {
      const fields = breakOutputs(pure, data.edges, open.has(pure.id))
      sizes.set(pure.id, { width: pureWidth, height: pinnedHeight(0, fields.shown.length, fields.foldable, pureHeader) })
      continue
    }
    const { shown, folded } = pureInputs(pure, open.has(pure.id))
    sizes.set(pure.id, { width: pureWidth, height: pinnedHeight(shown.length, 1, pure.kind === 'make' && (folded > 0 || open.has(pure.id)), pureHeader) })
  }
  return sizes
}
