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
 * What the layout places besides the graph: each node's size by its id, the Break, Make, condition and Select nodes
 * with the Map or Block each is inside, the wires between pins, which pull the nodes they join into order as edges do,
 * and where each node's pins are, so the wires meet their nodes where they are drawn and cross as little as they can.
 */
export type LayoutExtras = {
  sizes?: ReadonlyMap<string, { width: number; height: number }>
  pure?: readonly { id: string; parent?: string }[]
  wires?: readonly { id: string; source: string; target: string; sourceHandle?: string; targetHandle?: string }[]
  ports?: ReadonlyMap<string, readonly { handle: string; side: 'in' | 'out'; y: number }[]>
  /** The workflow runs in data order, where nodes go beside what reads them. */
  dataOrder?: boolean
}

// A pin's port on its node, as ELK names it
const portId = (node: string, handle: string) => `${node}\u0000${handle}`

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

// In data order, each node in the layer just before what reads it, so a Break, a condition node or a Select stands
// beside its reader and a step beside the steps that read it. In sequence order, where states that end the run would
// all go to the last layer, ELK balances the layers instead.
const dataOrderOptions = { 'elk.layered.layering.strategy': 'LONGEST_PATH' }
const mapPadding = { 'elk.padding': '[top=48,left=24,bottom=24,right=24]' }

const isGroup = (node: GraphNode) => node.kind === 'state' && holdsSteps(node.state)

/**
 * The graph as ELK's: each node a box of `nodeSize`, a Map or Block a box around the nodes inside it, which ELK sizes,
 * and each edge inside the Map or Block its two ends are in. Edge labels are left out: the canvas draws them on the edge's middle.
 */
export const elkGraph = (graph: Graph, extras: LayoutExtras = {}): ElkNode => {
  // A node with its pins as ports where they are drawn, which ELK keeps in place as it orders the nodes of each layer
  const sized = (id: string): ElkNode => {
    const size = extras.sizes?.get(id) ?? nodeSize
    const ports = extras.ports?.get(id)
    if (!ports?.length) return { id, ...size }
    return {
      id,
      ...size,
      layoutOptions: { 'elk.portConstraints': 'FIXED_POS' },
      ports: ports.map((port) => ({ id: portId(id, port.handle), x: port.side === 'in' ? 0 : size.width, y: port.y, width: 0, height: 0, layoutOptions: { 'elk.port.side': port.side === 'in' ? 'WEST' : 'EAST' } })),
    }
  }
  // A wire's end: its pin's port where the node has one, else the node
  const end = (node: string, handle: string | undefined) => (handle !== undefined && extras.ports?.get(node)?.some((port) => port.handle === handle) ? portId(node, handle) : node)
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
    ...(extras.wires ?? [])
      .filter((wire) => parentOf(wire.target) === parent && parentOf(wire.source) === parent)
      .map((wire) => ({ id: wire.id, sources: [end(wire.source, wire.sourceHandle)], targets: [end(wire.target, wire.targetHandle)] })),
  ]
  const top = graph.nodes.filter((node) => node.kind === 'trigger' || node.parent === undefined)
  return { id: 'root', layoutOptions: extras.dataOrder ? { ...rootOptions, ...dataOrderOptions } : rootOptions, children: [...top.map(elk), ...pureIn(undefined)], edges: edgesIn(undefined) }
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
