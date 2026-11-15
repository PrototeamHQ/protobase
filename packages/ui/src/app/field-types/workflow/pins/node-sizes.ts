import type { Graph } from '../definition-graph'
import { holdsSteps } from '../definition'
import type { DataGraph, PureNode } from './data-graph'
import type { InputPin } from './node-pins'
import { expressionTextHeight, pinnedHeight, pureWidth, rowHeight, shownInputs, stepWidth } from './pin-layout'

/** A node's size, as the layout places it. */
export type Size = { width: number; height: number }

// A Break's or a Make's title is one line
const pureHeader = 34

// A Make shows every field it builds, as Blueprints draw one, unless it has more than this
const makeFieldsShown = 8

/** The inputs a Make shows and how many it folds away, a condition node all of its own; a Break takes no inputs of its own. */
export const pureInputs = (pure: PureNode, open: boolean): { shown: InputPin[]; folded: number } => {
  if (pure.kind === 'condition') return { shown: pure.inputs, folded: 0 }
  return pure.kind === 'make' ? shownInputs(pure.inputs, open || pure.inputs.length <= makeFieldsShown) : { shown: [], folded: 0 }
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
    const { shown, folded } = pureInputs(pure, open.has(pure.id))
    const outputs = pure.kind === 'break' ? pure.outputs.length : 1
    sizes.set(pure.id, { width: pureWidth, height: pinnedHeight(shown.length, outputs, pure.kind === 'make' && (folded > 0 || open.has(pure.id)), pureHeader) })
  }
  return sizes
}
