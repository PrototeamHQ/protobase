import type { Edge, Node } from '@xyflow/react'
import type { WorkflowTypeList } from '@protobase/client'
import { cacheForcedAgainst } from './cache-advice'
import { triggerId } from './definition'
import type { Graph, GraphNode } from './definition-graph'
import { nodeSize, type Box } from './graph-layout'
import type { NodeTrace } from './node-trace'
import type { NodeProblem } from './problems'
import { stateLabel, triggerLabel } from './labels'
import { text } from './messages'

/**
 * What a node of the canvas draws from: its node of the graph, what it is (`kind`, its type's label), the problems the
 * check found with it and what it warns of, how it did in a run, and whether its cache was forced on against its type's
 * advice.
 */
export type NodeData = { node: GraphNode; kind: string; problems: NodeProblem[]; warnings?: NodeProblem[]; trace?: NodeTrace; cacheWarning?: boolean }

export type FlowNode = Node<NodeData, 'trigger' | 'state'>

// React Flow's ids: no state is named by an empty path, but React Flow wants every id to say something.
const triggerFlowId = 'trigger'
export const flowId = (id: string) => (id === triggerId ? triggerFlowId : `state:${id}`)
export const graphId = (id: string) => (id === triggerFlowId ? triggerId : id.slice('state:'.length))


/**
 * The canvas's nodes, at the boxes the layout gave them: a Map holds the nodes inside it, which come after it, and a
 * node not laid out yet waits at the top left. Nodes are not dragged: the layout places them.
 */
export const flowNodes = (graph: Graph, boxes: ReadonlyMap<string, Box> | undefined, problems: ReadonlyMap<string, NodeProblem[]>, selected: string | undefined, traces?: ReadonlyMap<string, NodeTrace>, types?: WorkflowTypeList, warnings?: ReadonlyMap<string, NodeProblem[]>): FlowNode[] =>
  graph.nodes.map((node) => {
    const box = boxes?.get(node.id) ?? { x: 0, y: 0, ...nodeSize }
    const parent = node.kind === 'state' ? node.parent : undefined
    const kind = node.kind === 'trigger' ? triggerLabel(node.trigger, types) : stateLabel(node.state, types)
    const cacheWarning = node.kind === 'state' && cacheForcedAgainst(node.state, types)
    const name = node.kind === 'state' ? text('stateNode', { name: node.name, type: kind }) : text('triggerNode', { trigger: kind })
    const warned = warnings?.get(node.id) ?? []
    const marks = [...(cacheWarning ? [text('cacheForcedAgainst')] : []), ...warned.map((warning) => warning.message)]
    return {
      id: flowId(node.id),
      type: node.kind,
      ariaLabel: [name, ...marks].join(', '),
      position: { x: box.x, y: box.y },
      width: box.width,
      height: box.height,
      // The node is drawn at its box's size, so React Flow knows it from the first render: a node handed over without
      // one loses its handles' places, and its edges vanish until its size changes
      measured: { width: box.width, height: box.height },
      data: { node, kind, problems: problems.get(node.id) ?? [], ...(traces?.has(node.id) && { trace: traces.get(node.id) }), ...(cacheWarning && { cacheWarning }), ...(warned.length > 0 && { warnings: warned }) },
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
