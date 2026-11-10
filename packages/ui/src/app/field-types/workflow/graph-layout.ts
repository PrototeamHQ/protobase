import type { ElkNode } from 'elkjs/lib/elk-api'
import type { Graph, GraphNode } from './definition-graph'
import { holdsSteps } from './definition'

/** A node's box: where its top left corner is, within the Map or Block it is inside or else the canvas, and its size. */
export type Box = { x: number; y: number; width: number; height: number }

/** What lays a graph out: ELK's `layout`, in a worker in the browser. */
export type LayoutEngine = { layout: (graph: ElkNode) => Promise<ElkNode> }

/** The size of every state's and the trigger's node: the layout places them, it does not size them. */
export const nodeSize = { width: 224, height: 64 }

// ELK's layered algorithm from top to bottom, laying out each Map's or Block's states inside it, with room for its title on top.
const rootOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.layered.spacing.nodeNodeBetweenLayers': '56',
  'elk.spacing.nodeNode': '40',
  'elk.edgeLabels.inline': 'false',
}
const mapPadding = { 'elk.padding': '[top=48,left=24,bottom=24,right=24]' }

const isGroup = (node: GraphNode) => node.kind === 'state' && holdsSteps(node.state)

/**
 * The graph as ELK's: each node a box of `nodeSize`, a Map or Block a box around the nodes inside it, which ELK sizes,
 * and each edge inside the Map or Block its two ends are in. Edge labels are left out: the canvas draws them on the edge's middle.
 */
export const elkGraph = (graph: Graph): ElkNode => {
  const elk = (node: GraphNode): ElkNode => {
    if (!isGroup(node)) return { id: node.id, ...nodeSize }
    const inside = graph.nodes.filter((child) => child.kind === 'state' && child.parent === node.id)
    return { id: node.id, layoutOptions: mapPadding, children: inside.map(elk), edges: edgesIn(node.id) }
  }
  const edgesIn = (parent: string | undefined) =>
    graph.edges.filter((edge) => parentOf(edge.target) === parent).map((edge) => ({ id: edge.id, sources: [edge.source], targets: [edge.target] }))
  const parentOf = (id: string) => {
    const node = graph.nodes.find((candidate) => candidate.id === id)
    return node?.kind === 'state' ? node.parent : undefined
  }
  const top = graph.nodes.filter((node) => node.kind === 'trigger' || node.parent === undefined)
  return { id: 'root', layoutOptions: rootOptions, children: top.map(elk), edges: edgesIn(undefined) }
}

/** Each node's box from ELK's laid out graph, by node id; a node inside a Map or Block is placed within it. */
export const laidOutBoxes = (laidOut: ElkNode): Map<string, Box> => {
  const boxes = new Map<string, Box>()
  const visit = (node: ElkNode) => {
    for (const child of node.children ?? []) {
      boxes.set(child.id, { x: child.x ?? 0, y: child.y ?? 0, width: child.width ?? nodeSize.width, height: child.height ?? nodeSize.height })
      visit(child)
    }
  }
  visit(laidOut)
  return boxes
}

/** The graph `elk` describes laid out by `engine`: each node's box. */
export const layoutElk = async (engine: LayoutEngine, elk: ElkNode) => laidOutBoxes(await engine.layout(elk))

/** The graph laid out by `engine`: each node's box. */
export const layoutGraph = (engine: LayoutEngine, graph: Graph) => layoutElk(engine, elkGraph(graph))
