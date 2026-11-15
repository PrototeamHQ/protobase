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
import type { DataGraph, PureNode } from './pins/data-graph'
import type { InputPin, OutputPin } from './pins/node-pins'
import { shownInputs } from './pins/pin-layout'
import { pinColour } from './pins/pin-text'
import { pureInputs } from './pins/node-sizes'
import { pureParent } from './pins/pure-parents'

/**
 * What a node of the canvas draws from: its node of the graph, what it is (`kind`, its type's label), the problems the
 * check found with it and what it warns of, how it did in a run, and whether its cache was forced on against its type's
 * advice.
 */
/** `dataOrder`: the workflow runs in data order, so the node has no execution handles to draw edges from by hand. */
/** What a Break's or a Make's node draws from: the node, which of its inputs it shows, and whether the canvas is editable. */
export type PureData = { pure: PureNode; shownInputs: InputPin[]; folded: number; open: boolean }

/** `moved`: the node was moved by hand, so the layout leaves it where it was put. */
export type NodeData = { node: GraphNode; kind: string; problems: NodeProblem[]; warnings?: NodeProblem[]; trace?: NodeTrace; cacheWarning?: boolean; pins?: NodePins; pureData?: PureData; dataOrder?: boolean; moved?: boolean }

/** The pins a node shows: the inputs it shows, its outputs, how many inputs it folds away and whether it is open. */
export type NodePins = { inputs: InputPin[]; outputs: OutputPin[]; folded: number; open: boolean }

export type FlowNode = Node<NodeData, 'trigger' | 'state' | 'pure'>

// React Flow's ids: no state is named by an empty path, but React Flow wants every id to say something.
const triggerFlowId = 'trigger'
// A Break's or a Make's id is its own, as no state has it.
/** A trigger's or a state's node id on the canvas: a state's always prefixed, whatever it is named, such as make:Report. */
export const flowId = (id: string) => (id === triggerId ? triggerFlowId : `state:${id}`)

/** Whether a canvas node is a Break or a Make: neither the trigger nor a state, whose ids flowId gives. */
export const isPureFlowId = (id: string) => id !== triggerFlowId && !id.startsWith('state:')

/** The graph's id of a canvas node: a state's name, the trigger's, or a Break's or a Make's id as it is. */
export const graphId = (id: string) => (id === triggerFlowId ? triggerId : id.startsWith('state:') ? id.slice('state:'.length) : id)

/** The pins of a node, as the data graph gives them and its optional inputs are open or folded. */
export const nodePins = (data: DataGraph, id: string, open: boolean): NodePins => {
  const { shown, folded } = shownInputs(data.inputs.get(id) ?? [], open)
  return { inputs: shown, outputs: data.outputs.get(id) ?? [], folded, open }
}


/**
 * The canvas's nodes, at the boxes the layout gave them: a Map holds the nodes inside it, which come after it, and a
 * node not laid out yet waits at the top left. Nodes are not dragged here: the canvas lets them be where it takes changes.
 */
export const flowNodes = (graph: Graph, boxes: ReadonlyMap<string, Box> | undefined, problems: ReadonlyMap<string, NodeProblem[]>, selected: string | undefined, traces?: ReadonlyMap<string, NodeTrace>, types?: WorkflowTypeList, warnings?: ReadonlyMap<string, NodeProblem[]>, pins?: { data: DataGraph; open: ReadonlySet<string> }, dataOrder = false): FlowNode[] =>
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
      data: { node, kind, problems: problems.get(node.id) ?? [], ...(traces?.has(node.id) && { trace: traces.get(node.id) }), ...(cacheWarning && { cacheWarning }), ...(warned.length > 0 && { warnings: warned }), ...(pins && { pins: nodePins(pins.data, node.id, pins.open.has(node.id)) }), ...(dataOrder && { dataOrder }) },
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

// In data order an edge is what a state reads, drawn between each node's sides, which only changing what it reads changes
const dataOrderEdge = (edge: Graph['edges'][number]): Edge => ({
  id: edge.id,
  source: flowId(edge.source),
  sourceHandle: 'out',
  target: flowId(edge.target),
  targetHandle: 'in',
  deletable: false,
  data: { kind: edge.kind, field: edge.field, source: edge.source },
  ...(edge.kind === 'status' && { className: 'pb-workflow-status' }),
})

/** The canvas's edges, each from the handle of its kind; the trigger's cannot be deleted, only drawn elsewhere. */
export const flowEdges = (graph: Graph, dataOrder = false): Edge[] =>
  graph.edges.map((edge) => {
    if (dataOrder) return dataOrderEdge(edge)
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

/** The Break and Make nodes, at their boxes, inside the Map or Block of what they break or make. */
export const pureFlowNodes = (graph: Graph, data: DataGraph, boxes: ReadonlyMap<string, Box> | undefined, open: ReadonlySet<string>): FlowNode[] =>
  data.pure.map((pure) => {
    const box = boxes?.get(pure.id) ?? { x: 0, y: 0, ...nodeSize }
    const parent = pureParent(graph, pure)
    const { shown, folded } = pureInputs(pure, open.has(pure.id))
    // The graph node it stands beside, which names nothing a panel opens
    const near = graph.nodes.find((node) => node.id === (pure.kind === 'break' ? pure.source : pure.target))!
    return {
      id: pure.id,
      type: 'pure' as const,
      position: { x: box.x, y: box.y },
      width: box.width,
      height: box.height,
      measured: { width: box.width, height: box.height },
      data: { node: near, kind: pure.kind, problems: [], pureData: { pure, shownInputs: shown, folded, open: open.has(pure.id) } },
      draggable: false,
      deletable: true,
      ...(parent !== undefined && { parentId: flowId(parent), extent: 'parent' as const }),
    }
  })

/** The wires between pins, each coloured by the type of what it carries. */
/**
 * In data order with pins, the lines between steps that no wire stands for: a step that reads another only in a way no
 * pin shows, such as a variable assigned part of its result, still shows that it runs after it.
 */
export const unwiredOrderEdges = (graph: Graph, data: DataGraph): Edge[] => {
  // The step a wire's end belongs to, through the Break or Make it passes
  const step = (node: string) => {
    const pure = data.pure.find((each) => each.id === node)
    return pure ? (pure.kind === 'break' ? pure.source : pure.target) : node
  }
  const wired = new Set(data.edges.map((edge) => `${step(edge.source)}\n${step(edge.target)}`))
  // The trigger's lines start the states that read nothing, which the run's input pins show
  return flowEdges({ ...graph, edges: graph.edges.filter((edge) => edge.source !== triggerId && !wired.has(`${edge.source}\n${edge.target}`)) }, true)
}

export const dataFlowEdges = (data: DataGraph): Edge[] => {
  // A wire's end is a Break's or a Make's, as the graph lists them, else a step's or the trigger's
  const pure = new Set(data.pure.map((node) => node.id))
  const end = (id: string) => (pure.has(id) ? id : flowId(id))
  return data.edges.map((edge) => ({
    id: edge.id,
    source: end(edge.source),
    sourceHandle: edge.sourceHandle,
    target: end(edge.target),
    targetHandle: edge.targetHandle,
    // A read inside an expression goes only as the expression changes
    deletable: !edge.expression,
    data: { kind: 'data', wire: edge },
    className: `pb-wire pb-wire-${pinColour(edge.type)}${edge.expression ? ' pb-wire-expression' : ''}`,
  }))
}
