import type { ElkNode } from 'elkjs/lib/elk-api'
import type { Graph, GraphNode } from './definition-graph'
import { holdsSteps } from './definition'

/** A node's box: where its top left corner is, within the Map or Block it is inside or else the canvas, and its size. */
export type Box = { x: number; y: number; width: number; height: number }

/** What lays a graph out: ELK's `layout`, in a worker in the browser. */
export type LayoutEngine = { layout: (graph: ElkNode) => Promise<ElkNode> }

/** The size of a node the layout is given no size for: the layout places nodes, it does not size them. */
export const nodeSize = { width: 224, height: 64 }

/**
 * What the layout places besides the graph: each node's size by its id, the Break and Make nodes with the Map or Block
 * each is inside, and the wires between pins, which pull the nodes they join into order as edges do.
 */
export type LayoutExtras = {
  sizes?: ReadonlyMap<string, { width: number; height: number }>
  pure?: readonly { id: string; parent?: string }[]
  wires?: readonly { id: string; source: string; target: string }[]
}

// ELK's layered algorithm from left to right, as execution runs in Blueprints, laying out each Map's or Block's states
// inside it, with room for its title on top.
const rootOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.layered.spacing.nodeNodeBetweenLayers': '72',
  'elk.spacing.nodeNode': '32',
  'elk.edgeLabels.inline': 'false',
}
const mapPadding = { 'elk.padding': '[top=48,left=24,bottom=24,right=24]' }

const isGroup = (node: GraphNode) => node.kind === 'state' && holdsSteps(node.state)

/**
 * The graph as ELK's: each node a box of `nodeSize`, a Map or Block a box around the nodes inside it, which ELK sizes,
 * and each edge inside the Map or Block its two ends are in. Edge labels are left out: the canvas draws them on the edge's middle.
 */
export const elkGraph = (graph: Graph, extras: LayoutExtras = {}): ElkNode => {
  const sized = (id: string) => ({ id, ...(extras.sizes?.get(id) ?? nodeSize) })
  const pureIn = (parent: string | undefined) => (extras.pure ?? []).filter((pure) => pure.parent === parent).map((pure) => sized(pure.id))
  const elk = (node: GraphNode): ElkNode => {
    if (!isGroup(node)) return sized(node.id)
    const inside = graph.nodes.filter((child) => child.kind === 'state' && child.parent === node.id)
    return { id: node.id, layoutOptions: mapPadding, children: [...inside.map(elk), ...pureIn(node.id)], edges: edgesIn(node.id) }
  }
  const parentOf = (id: string) => {
    const pure = extras.pure?.find((candidate) => candidate.id === id)
    if (pure) return pure.parent
    const node = graph.nodes.find((candidate) => candidate.id === id)
    return node?.kind === 'state' ? node.parent : undefined
  }
  // A wire joins two nodes of one machine; one into or out of a Map is drawn but not laid out by
  const edgesIn = (parent: string | undefined) => [
    ...graph.edges.filter((edge) => parentOf(edge.target) === parent).map((edge) => ({ id: edge.id, sources: [edge.source], targets: [edge.target] })),
    ...(extras.wires ?? []).filter((wire) => parentOf(wire.target) === parent && parentOf(wire.source) === parent).map((wire) => ({ id: wire.id, sources: [wire.source], targets: [wire.target] })),
  ]
  const top = graph.nodes.filter((node) => node.kind === 'trigger' || node.parent === undefined)
  return { id: 'root', layoutOptions: rootOptions, children: [...top.map(elk), ...pureIn(undefined)], edges: edgesIn(undefined) }
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
export const layoutGraph = (engine: LayoutEngine, graph: Graph, extras?: LayoutExtras) => layoutElk(engine, elkGraph(graph, extras))
