import dagre from '@dagrejs/dagre'
import type { GraphShape } from './graph-shape'

/** Every node's size: room for its label on one or two lines and its status badge. */
export const nodeSize = { width: 200, height: 64 }

/** A box at its top-left corner, in the graph's own coordinates. */
export type Box = { x: number; y: number; width: number; height: number }

/** Where each group and node of a graph sits, groups around their nodes and edges running top to bottom, and its whole size. */
export type GraphLayout = { groups: Map<string, Box>; nodes: Map<string, Box>; width: number; height: number }

const groupId = (id: string) => `group:${id}`
const nodeId = (id: string) => `node:${id}`

// dagre gives centres; React Flow places by the top-left corner
const boxOf = ({ x, y, width, height }: { x?: number; y?: number; width: number; height: number }): Box => ({ x: (x ?? 0) - width / 2, y: (y ?? 0) - height / 2, width, height })

/**
 * Lays out `shape` as a layered graph, edges top to bottom, which keeps it narrow enough for a phone, each group a box around its nodes (dagre's compound
 * layout). It is computed from the shape alone, whose order is fixed, so the same records always make the same picture.
 */
export const graphLayout = (shape: GraphShape): GraphLayout => {
  const graph = new dagre.graphlib.Graph({ compound: true, multigraph: true })
  graph.setGraph({ rankdir: 'TB', nodesep: 32, ranksep: 56, marginx: 0, marginy: 0 })
  graph.setDefaultEdgeLabel(() => ({}))
  for (const group of shape.groups) graph.setNode(groupId(group.id), {})
  for (const node of shape.nodes) {
    graph.setNode(nodeId(node.id), { ...nodeSize })
    if (node.group !== undefined) graph.setParent(nodeId(node.id), groupId(node.group))
  }
  for (const edge of shape.edges) graph.setEdge(nodeId(edge.source), nodeId(edge.target), {}, edge.id)
  dagre.layout(graph)
  const { width = 0, height = 0 } = graph.graph()
  return {
    width,
    height,
    groups: new Map(shape.groups.map((group) => [group.id, boxOf(graph.node(groupId(group.id)))])),
    nodes: new Map(shape.nodes.map((node) => [node.id, boxOf(graph.node(nodeId(node.id)))])),
  }
}
