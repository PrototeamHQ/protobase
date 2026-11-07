import { Background, Controls, ReactFlow, ReactFlowProvider, useReactFlow, useStore, useUpdateNodeInternals, type Connection, type Edge, type EdgeChange, type IsValidConnection, type NodeChange } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './workflow-canvas.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { WorkflowTypeList } from '@protobase/client'
import type { Definition } from '@protobase/workflows'
import { triggerId } from './definition'
import { connect, disconnect, removeState } from './definition-edits'
import { definitionGraph, type EdgeKind, type GraphNode } from './definition-graph'
import { flowEdges, flowNodes, graphId, type FlowNode } from './flow-elements'
import { StateNode, TriggerNode } from './flow-nodes'
import type { NodeTrace } from './node-trace'
import type { NodeProblem } from './problems'
import { useLayout } from './use-layout'
import { text } from './messages'

const nodeTypes = { state: StateNode, trigger: TriggerNode }

export type WorkflowCanvasProps = {
  definition: Definition
  problems: ReadonlyMap<string, NodeProblem[]>
  /** The node chosen, by its graph id: the trigger's, or a state's path. */
  selected: string | undefined
  onSelect: (id: string | undefined) => void
  /** Without it, the graph is only shown. */
  onChange?: (definition: Definition) => void
  /** How each state did in a run, by its path, marked on its node. */
  traces?: ReadonlyMap<string, NodeTrace>
  /** The app's types, whose labels name the nodes and whose cache advice marks them. */
  types?: WorkflowTypeList
  /** The canvas is the window, on a page that does not scroll, so the wheel pans it as on any canvas. */
  fills?: boolean
}

// The machine a node's states lead within: the Maps it is inside, or the trigger's, the whole workflow's.
const scopeOf = (node: GraphNode | undefined) => (node?.kind === 'state' ? node.scope.join('/') : '')

// Each new layout is fitted to the canvas, so a change is in sight without zooming by hand.
const FitOnLayout = ({ laidOut }: { laidOut: unknown }) => {
  const flow = useReactFlow()
  useEffect(() => {
    if (laidOut) void flow.fitView({ maxZoom: 1, padding: 0.1 })
  }, [laidOut])
  return null
}

// A canvas that fills its page narrows as a panel opens: what was in its middle stays there.
const KeepCentre = () => {
  const flow = useReactFlow()
  const width = useStore((state) => state.width)
  const before = useRef(width)
  useEffect(() => {
    const change = width - before.current
    before.current = width
    if (change === 0 || width === 0) return
    const { x, y, zoom } = flow.getViewport()
    void flow.setViewport({ x: x + change / 2, y, zoom })
  }, [width, flow])
  return null
}

// Each new layout measures every node's handles again: a Map's box grows with the states inside it, and its edges
// leave from where its handles are now.
const MeasureOnLayout = ({ laidOut, ids }: { laidOut: unknown; ids: string[] }) => {
  const updateNodeInternals = useUpdateNodeInternals()
  useEffect(() => {
    if (laidOut) updateNodeInternals(ids)
  }, [laidOut])
  return null
}

const Canvas = ({ definition, problems, selected, onSelect, onChange, traces, types, fills = false }: WorkflowCanvasProps) => {
  const graph = useMemo(() => definitionGraph(definition), [definition])
  const boxes = useLayout(graph)
  const nodes = useMemo(() => flowNodes(graph, boxes, problems, selected, traces, types), [graph, boxes, problems, selected, traces, types])
  // The edge chosen, which Delete removes
  const [chosenEdge, setChosenEdge] = useState<string>()
  const edges = useMemo(() => flowEdges(graph).map((edge) => ({ ...edge, selected: edge.id === chosenEdge })), [graph, chosenEdge])
  const byId = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph])
  const editable = Boolean(onChange)

  // A state leads only to a state of its own machine: the trigger to one of the workflow's, a Map's to its own.
  const isValidConnection: IsValidConnection = (connection) => {
    const target = byId.get(graphId(connection.target))
    const source = byId.get(graphId(connection.source))
    return target?.kind === 'state' && scopeOf(source) === scopeOf(target)
  }
  const onNodesChange = (changes: NodeChange<FlowNode>[]) => {
    // A node chosen by the keyboard opens its form as a click does
    const picked = changes.find((change) => change.type === 'select' && change.selected)
    if (picked?.type === 'select') onSelect(graphId(picked.id))
  }
  const onEdgesChange = (changes: EdgeChange[]) => {
    for (const change of changes) {
      if (change.type !== 'select') continue
      if (change.selected) setChosenEdge(change.id)
      else setChosenEdge((current) => (current === change.id ? undefined : current))
    }
  }
  const onConnect = (connection: Connection) => {
    if (!onChange || !connection.sourceHandle) return
    onChange(connect(definition, connection.sourceHandle as EdgeKind, graphId(connection.source), graphId(connection.target)))
  }
  // Deleting a state takes the edges to it along: its own removal does that, so they are left alone here.
  const onDelete = ({ nodes: gone, edges: cut }: { nodes: { id: string }[]; edges: Edge[] }) => {
    if (!onChange) return
    const removed = gone.map((node) => graphId(node.id)).filter((id) => id !== triggerId)
    let next = definition
    for (const edge of cut) {
      const data = edge.data as { kind: EdgeKind; field: string; source: string }
      if (!removed.includes(data.source) && !removed.includes(graphId(edge.target))) next = disconnect(next, data)
    }
    // A Map's states go with it
    for (const path of removed) if (!removed.some((other) => path.startsWith(`${other}/`))) next = removeState(next, path)
    onChange(next)
  }

  return (
    <ReactFlow
      className="pb-workflow"
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      nodesDraggable={false}
      nodesConnectable={editable}
      edgesFocusable={editable}
      elementsSelectable
      deleteKeyCode={editable ? ['Backspace', 'Delete'] : null}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      isValidConnection={isValidConnection}
      onConnect={onConnect}
      onDelete={onDelete}
      onNodeClick={(_, node) => onSelect(graphId(node.id))}
      onPaneClick={() => onSelect(undefined)}
      // Where the page scrolls under the wheel and a finger, the canvas zooms by its buttons and by pinching
      zoomOnScroll={false}
      panOnScroll={fills}
      preventScrolling={fills}
      minZoom={0.2}
      maxZoom={1.5}
      aria-label={text('canvas')}
    >
      <Background gap={16} />
      <Controls showInteractive={false} />
      <FitOnLayout laidOut={boxes} />
      {fills && <KeepCentre />}
      <MeasureOnLayout laidOut={boxes} ids={nodes.map((node) => node.id)} />
    </ReactFlow>
  )
}

/**
 * The workflow's graph on a canvas, laid out by ELK each time it changes: the trigger, a node per state, a Map's states
 * inside it, and an edge per state it leads to. With `onChange`, handles connect states, Delete removes the chosen
 * state or edge, and each change is the definition edited.
 */
export const WorkflowCanvas = (props: WorkflowCanvasProps) => (
  <ReactFlowProvider>
    <Canvas {...props} />
  </ReactFlowProvider>
)
