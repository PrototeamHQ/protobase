import type { Graph } from '../definition-graph'
import type { PureNode } from './data-graph'

/** The Map or Block a Break or a Make is inside: the one around the node whose value it breaks, or the step it makes an argument of. */
export const pureParent = (graph: Graph, pure: PureNode) => {
  const near = graph.nodes.find((node) => node.id === (pure.kind === 'break' ? pure.source : pure.target))
  return near?.kind === 'state' ? near.parent : undefined
}
