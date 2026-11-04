import type { Edge, Node } from '@xyflow/react'
import { triggerId } from './definition'
import type { Graph, GraphNode } from './definition-graph'
import { nodeSize, type Box } from './graph-layout'
import type { NodeProblem } from './problems'
import { stateLabel, triggerLabel } from './labels'
import { text } from './messages'

/** What a node of the canvas draws from: its node of the graph and the problems the check found with it. */
export type NodeData = { node: GraphNode; problems: NodeProblem[] }

export type FlowNode = Node<NodeData, 'trigger' | 'state'>

// React Flow's ids: no state is named by an empty path, but React Flow wants every id to say something.
const triggerFlowId = 'trigger'
export const flowId = (id: string) => (id === triggerId ? triggerFlowId : `state:${id}`)
export const graphId = (id: string) => (id === triggerFlowId ? triggerId : id.slice('state:'.length))


/**
 * The canvas's nodes, at the boxes the layout gave them: a Map holds the nodes inside it, which come after it, and a
 * node not laid out yet waits at the top left. Nodes are not dragged: the layout places them.
 */
export const flowNodes = (graph: Graph, boxes: ReadonlyMap<string, Box> | undefined, problems: ReadonlyMap<string, NodeProblem[]>, selected: string | undefined): FlowNode[] =>
  graph.nodes.map((node) => {
    const box = boxes?.get(node.id) ?? { x: 0, y: 0, ...nodeSize }
    const parent = node.kind === 'state' ? node.parent : undefined
    return {
      id: flowId(node.id),
      type: node.kind,
      ariaLabel: node.kind === 'trigger' ? text('triggerNode', { trigger: triggerLabel(node.trigger) }) : text('stateNode', { name: node.name, type: stateLabel(node.state) }),
      position: { x: box.x, y: box.y },
      width: box.width,
      height: box.height,
      data: { node, problems: problems.get(node.id) ?? [] },
      draggable: false,
      deletable: node.kind === 'state',
      selected: node.id === selected,
      ...(parent !== undefined && { parentId: flowId(parent), extent: 'parent' as const }),
    }
  })

// A condition longer than this is cut on its edge; the step's form shows it whole.
const labelLength = 40

const shortened = (label: string) => (label.length > labelLength ? `${label.slice(0, labelLength - 1)}…` : label)

const edgeLabel = (edge: Graph['edges'][number]) => {
  if (edge.kind === 'default') return text('otherwise')
  if (edge.kind === 'catch') return text('onError', { errors: edge.label ?? '' })
  if (edge.kind === 'rule') return edge.label ? shortened(edge.label) : text('conditionToWrite')
  return
}

/** The canvas's edges, each from the handle of its kind; the trigger's cannot be deleted, only drawn elsewhere. */
export const flowEdges = (graph: Graph): Edge[] =>
  graph.edges.map((edge) => {
    const label = edgeLabel(edge)
    return {
      id: edge.id,
      source: flowId(edge.source),
      sourceHandle: edge.kind,
      target: flowId(edge.target),
      targetHandle: 'in',
      deletable: edge.kind !== 'start',
      data: { kind: edge.kind, field: edge.field, source: edge.source },
      ...(label !== undefined && { label }),
      ...(edge.kind === 'catch' && { className: 'pb-workflow-catch' }),
    }
  })
