import { Background, Controls, Panel, ReactFlow, ReactFlowProvider, useKeyPress, useReactFlow, useStore, useUpdateNodeInternals, type Connection, type Edge, type EdgeChange, type IsValidConnection, type NodeChange, type XYPosition } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './workflow-canvas.css'
import { LayoutGrid } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { WorkflowTypeList } from '@protobase/client'
import { orderOf, type Definition, type PinSchemas } from '@protobase/workflows'
import { triggerId } from './definition'
import type { CanvasEdits } from './canvas-edits'
import type { AddAt } from './definition-edits'
import { definitionGraph, type EdgeKind, type GraphNode } from './definition-graph'
import { dataFlowEdges, flowEdges, flowId, flowNodes, graphId, isPureFlowId, pureFlowNodes, unwiredOrderEdges, type FlowNode } from './flow-elements'
import { AddAtContext } from './add-at-context'
import { StateNode, TriggerNode } from './flow-nodes'
import { Button } from '../../../primitives/button'
import { Segmented } from '../../../primitives/segmented'
import { useGraphView, type GraphView } from './pins/graph-view'
import { PinActionsContext } from './pins/pin-actions'
import { PureNodeView } from './pins/pure-nodes'
import { PureOfferMenu } from './pins/pure-offer'
import { pureParent } from './pins/pure-parents'
import { isPinHandle, usePins } from './pins/use-pins'
import { WireCheckContext, WireLine } from './pins/wire-line'
import type { NodeTrace } from './node-trace'
import type { NodeProblem } from './problems'
import { useLayout } from './use-layout'
import { layoutKey, placedBoxes, withoutKey, workflowLayoutOf, type ManualLayout, type WorkflowLayout } from './manual-layout'
import { UnpinContext } from './unpin-context'
import { text } from './messages'

const nodeTypes = { state: StateNode, trigger: TriggerNode, pure: PureNodeView }

export type WorkflowCanvasProps = {
  definition: Definition
  problems: ReadonlyMap<string, NodeProblem[]>
  /** The node chosen, by its graph id: the trigger's, or a state's path. */
  selected: string | undefined
  onSelect: (id: string | undefined) => void
  /** Without it and `edits`, the graph is only shown. */
  onChange?: (definition: Definition) => void
  /** What the canvas edits the definition with, `canvasEdits`, handed over with `onChange` so a canvas that only shows loads none of it. */
  edits?: CanvasEdits
  /** A click on a source handle, rather than a drag from it: a step is to be added there. */
  onAddAt?: (at: AddAt) => void
  /** How each state did in a run, by its path, marked on its node. */
  traces?: ReadonlyMap<string, NodeTrace>
  /** What the check warns of, by node, which a save goes through with. */
  warnings?: ReadonlyMap<string, NodeProblem[]>
  /** The app's types, whose labels name the nodes and whose cache advice marks them. */
  types?: WorkflowTypeList
  /** The schemas pins are typed by: with them, every step shows its inputs and outputs as pins, wired by the reads its arguments make. */
  schemas?: PinSchemas
  /** The canvas is the window, on a page that does not scroll: as a panel opens beside it, what was in its middle stays there. */
  fills?: boolean
  /** Where nodes were moved by hand in each view, by their layout keys, which the layout leaves where they were put. */
  layout?: WorkflowLayout
  /**
   * Without it, no node is moved by hand: with it, a node dragged stays where it is let go in the view shown, and Unpin
   * and Tidy up hand that view's nodes back to the layout.
   */
  onLayoutChange?: (layout: WorkflowLayout) => void
}

// The machine a node's states lead within: the Maps it is inside, or the trigger's, the whole workflow's.
const scopeOf = (node: GraphNode | undefined) => (node?.kind === 'state' ? node.scope.join('/') : '')

// Each new layout is fitted to the canvas, so a change is in sight without zooming by hand, as is the graph tidied up;
// a node moved by hand moves nothing else in sight.
const FitOnLayout = ({ laidOut, tidied }: { laidOut: unknown; tidied: number }) => {
  const flow = useReactFlow()
  useEffect(() => {
    if (laidOut) void flow.fitView({ maxZoom: 1, padding: 0.1 })
  }, [laidOut, tidied])
  return null
}

// A canvas that fills its page narrows as a panel opens: what was in its middle stays there.
const KeepCentre = () => {
  const flow = useReactFlow()
  const width = useStore((state) => state.width)
  const before = useRef(width)
  useEffect(() => {
    const previous = before.current
    before.current = width
    // Only between two measured widths: the first measurement, and one back from a hidden pane, move nothing
    if (previous === 0 || width === 0 || width === previous) return
    const { x, y, zoom } = flow.getViewport()
    void flow.setViewport({ x: x + (width - previous) / 2, y, zoom })
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

// Where nodes dragged are until they are let go, by their canvas ids
const notDragged: ReadonlyMap<string, XYPosition> = new Map()

const Canvas = ({ definition, problems, warnings, selected, onSelect, onChange: changed, edits, onAddAt, traces, types, schemas, fills = false, layout, onLayoutChange }: WorkflowCanvasProps) => {
  const editing = changed && edits && { onChange: changed, edits }
  const graph = useMemo(() => definitionGraph(definition), [definition])
  const frame = useRef<HTMLDivElement>(null)
  // The simple view is the same document drawn without pins: its lines are the execution edges, which stay the lines
  // between steps when the order of steps comes from what they read
  const [view, setView] = useGraphView()
  const pins = usePins(definition, graph, view === 'pins' ? schemas : undefined, editing, frame)
  const laidOut = useLayout(graph, pins.layout)
  const byId = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph])
  // The record hands the layout over anew on each render: it changes only when its JSON does. Each view keeps its own.
  const layoutJson = JSON.stringify(layout ?? {})
  const whole = useMemo(() => workflowLayoutOf(layoutJson), [layoutJson])
  const manual = whole[view]
  const changeView = (next: ManualLayout) => onLayoutChange?.({ ...whole, [view]: next })
  // Each node's layout key, by its id on the graph, a Break's or a Make's its own
  const keys = useMemo(() => new Map([...graph.nodes.map((node): [string, string] => [node.id, layoutKey(node.id)]), ...(pins.data?.pure ?? []).map((pure): [string, string] => [pure.id, layoutKey(pure.id, pure)])]), [graph, pins.data])
  const moved = useMemo(() => new Map([...keys].flatMap(([id, key]) => (Object.hasOwn(manual, key) ? [[id, manual[key]!] as const] : []))), [keys, manual])
  // The nodes ELK laid out, with the moved ones where they were put and the others clear of them
  const boxes = useMemo(() => {
    if (!laidOut) return undefined
    const pure = new Map((pins.data?.pure ?? []).map((node) => [node.id, node]))
    const parentOf = (id: string) => {
      const node = byId.get(id)
      return pure.has(id) ? pureParent(graph, pure.get(id)!) : node?.kind === 'state' ? node.parent : undefined
    }
    return placedBoxes(laidOut, moved, parentOf)
  }, [laidOut, moved, byId, graph, pins.data])
  const movable = Boolean(onLayoutChange)
  const [dragged, setDragged] = useState(notDragged)
  const [tidied, setTidied] = useState(0)
  const dataOrder = orderOf(definition) === 'data'
  // The nodes chosen, by their canvas ids, which move together and which Delete removes: Shift-click adds or takes one
  // out, and a Shift-drag box chooses every node it covers. A step's form opens only while it is the one node chosen.
  const [chosen, setChosen] = useState<ReadonlySet<string>>(() => new Set(selected === undefined ? [] : [flowId(selected)]))
  // A step chosen from outside, such as one just added, is the one node chosen; its form closed from outside, it no longer is
  useEffect(() => {
    setChosen((current) => {
      if (selected !== undefined) return current.has(flowId(selected)) ? current : new Set([flowId(selected)])
      return current.size === 1 && !isPureFlowId([...current][0]!) ? new Set() : current
    })
  }, [selected])
  const nodes = useMemo(
    () =>
      [
        ...flowNodes(graph, boxes, problems, selected, traces, types, warnings, pins.data && { data: pins.data, open: pins.open }, dataOrder),
        ...(pins.data ? pureFlowNodes(graph, pins.data, boxes, pins.open) : []),
      ].map((node) => {
        const at = dragged.get(node.id)
        const pinned = moved.has(graphId(node.id))
        return {
          ...node,
          selected: chosen.has(node.id),
          draggable: movable,
          ...(at && { position: at }),
          ...(pinned && { data: { ...node.data, moved: true }, ...(node.ariaLabel && { ariaLabel: `${node.ariaLabel}, ${text('movedByHand')}` }) }),
        }
      }),
    [graph, boxes, problems, selected, traces, types, warnings, pins.data, pins.open, dataOrder, chosen, dragged, moved, movable],
  )
  // The edge chosen, which Delete removes
  const [chosenEdge, setChosenEdge] = useState<string>()
  // In data order with pins, the wires are what the states read, which order them: another line between two states is
  // drawn only where no wire stands for it
  const edges = useMemo(
    () => [...(dataOrder && pins.data ? unwiredOrderEdges(graph, pins.data) : flowEdges(graph, dataOrder)), ...(pins.data ? dataFlowEdges(pins.data) : [])].map((edge) => ({ ...edge, selected: edge.id === chosenEdge })),
    [graph, pins.data, chosenEdge, dataOrder],
  )
  const editable = Boolean(editing)

  // A state leads only to a state of its own machine: the trigger to one of the workflow's, a Map's to its own.
  const isValidConnection: IsValidConnection = (connection) => {
    // A wire joins pins, as their types allow; execution runs along the other handles
    if (isPinHandle(connection.sourceHandle) || isPinHandle(connection.targetHandle)) return isPinHandle(connection.sourceHandle) && isPinHandle(connection.targetHandle) && pins.isValid(connection)
    if (connection.targetHandle !== 'in') return false
    const target = byId.get(graphId(connection.target))
    const source = byId.get(graphId(connection.source))
    return target?.kind === 'state' && scopeOf(source) === scopeOf(target)
  }
  // Nodes let go stay where they are, each under its key; one let go where the layout has it stays the layout's
  const drop = (positions: ReadonlyMap<string, XYPosition>) => {
    setDragged(notDragged)
    const placed = [...positions].flatMap(([node, at]): [string, XYPosition][] => {
      const id = graphId(node)
      const key = keys.get(id)
      const box = boxes?.get(id)
      const point = { x: Math.round(at.x), y: Math.round(at.y) }
      if (key === undefined || (!moved.has(id) && box && Math.round(box.x) === point.x && Math.round(box.y) === point.y)) return []
      return [[key, point]]
    })
    if (placed.length > 0) changeView({ ...manual, ...Object.fromEntries(placed) })
  }
  const unpin = onLayoutChange && ((node: string) => {
    const key = keys.get(graphId(node))
    if (key !== undefined) changeView(withoutKey(manual, key))
  })
  const tidy = () => {
    changeView({})
    setTidied((count) => count + 1)
  }
  const onNodesChange = (changes: NodeChange<FlowNode>[]) => {
    // A node follows the pointer while dragged, and the arrow keys move the chosen one, each move let go at once
    const dropped = new Map<string, XYPosition>()
    for (const change of changes) {
      if (change.type !== 'position' || !change.position || !movable) continue
      const at = change.position
      if (change.dragging) setDragged((current) => new Map(current).set(change.id, at))
      else dropped.set(change.id, at)
    }
    if (dropped.size > 0) drop(dropped)
    const choices = changes.filter((change) => change.type === 'select')
    if (choices.length === 0) return
    const next = new Set(chosen)
    for (const change of choices) {
      if (change.selected) next.add(change.id)
      else next.delete(change.id)
    }
    setChosen(next)
    // A step's form opens when it is chosen alone, by a plain click or the keyboard; a Break, a Make or several nodes
    // chosen open none. A choice made with Shift or a box never opens one, not even while it holds one step on the way.
    const [only] = next.size === 1 ? [...next] : []
    const step = only === undefined || isPureFlowId(only) ? undefined : graphId(only)
    if (step !== undefined && (shiftHeld || boxing.current)) return selected === undefined ? undefined : onSelect(undefined)
    if (step !== selected) onSelect(step)
  }
  // Whether a choice is being made with Shift or a box, which opens no step's form
  const shiftHeld = useKeyPress('Shift')
  const boxing = useRef(false)
  const onEdgesChange = (changes: EdgeChange[]) => {
    for (const change of changes) {
      if (change.type !== 'select') continue
      if (change.selected) setChosenEdge(change.id)
      else setChosenEdge((current) => (current === change.id ? undefined : current))
    }
  }
  const onConnect = (connection: Connection) => {
    if (!editing || !connection.sourceHandle) return
    if (isPinHandle(connection.sourceHandle)) return pins.connect(connection)
    editing.onChange(editing.edits.connect(definition, connection.sourceHandle as EdgeKind, graphId(connection.source), graphId(connection.target)))
  }
  // Deleting a state takes the edges to it along: its own removal does that, so they are left alone here.
  const onDelete = ({ nodes: gone, edges: cut }: { nodes: { id: string }[]; edges: Edge[] }) => {
    if (!editing) return
    const removed = gone.filter((node) => !isPureFlowId(node.id)).map((node) => graphId(node.id)).filter((id) => id !== triggerId)
    let next = pins.remove(definition, gone, cut)
    for (const edge of cut) {
      const data = edge.data as { kind: EdgeKind; field: string; source: string }
      if ((data.kind as string) === 'data') continue
      if (!removed.includes(data.source) && !removed.includes(graphId(edge.target))) next = editing.edits.disconnect(next, data)
    }
    // A Map's states go with it
    for (const path of removed) if (!removed.some((other) => path.startsWith(`${other}/`))) next = editing.edits.removeState(next, path)
    editing.onChange(next)
  }

  return (
    <AddAtContext.Provider value={editing ? onAddAt : undefined}>
      <UnpinContext.Provider value={unpin}>
        <PinActionsContext.Provider value={pins.actions}>
          <WireCheckContext.Provider value={pins.check}>
            <div ref={frame} className="relative h-full w-full">
              <ReactFlow
                className="pb-workflow"
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                nodesDraggable={movable}
                // A click that slips a pixel or two moves nothing, and a node moved is not chosen: its form would narrow the
                // canvas under the pointer
                nodeDragThreshold={4}
                selectNodesOnDrag={false}
                nodesConnectable={editable}
                // A click on a handle adds a step there; a connection is drawn by dragging, from a few pixels on
                connectOnClick={false}
                connectionDragThreshold={4}
                edgesFocusable={editable}
                elementsSelectable
                deleteKeyCode={editable ? ['Backspace', 'Delete'] : null}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                isValidConnection={isValidConnection}
                onConnect={onConnect}
                onConnectEnd={pins.connectEnd}
                connectionLineComponent={WireLine}
                onDelete={onDelete}
                // Shift adds a node to the choice or takes it out, as a Shift-drag box adds every node it covers
                multiSelectionKeyCode="Shift"
                onSelectionStart={() => void (boxing.current = true)}
                onSelectionEnd={() => void (boxing.current = false)}
                // A click on a step chooses it alone, opening its form; with Shift it only adds to the choice, in onNodesChange
                onNodeClick={(event, node) => !event.shiftKey && !isPureFlowId(node.id) && onSelect(graphId(node.id))}
                onPaneClick={() => onSelect(undefined)}
                // As in Blueprints: the wheel zooms towards the pointer, as does a pinch, and dragging the empty canvas with
                // the left, middle or right button pans it; Shift-drag selects a box. A trackpad's two-finger scroll is a
                // wheel too, so it zooms: telling it from a mouse's wheel would be a guess. Over the canvas the page does
                // not scroll; elsewhere it does.
                zoomOnScroll
                panOnScroll={false}
                panOnDrag={[0, 1, 2]}
                selectionOnDrag={false}
                selectionKeyCode="Shift"
                preventScrolling
                onPaneContextMenu={(event) => event.preventDefault()}
                minZoom={0.2}
                maxZoom={1.5}
                aria-label={text('canvas')}
              >
                <Background gap={16} />
                {schemas && (
                  <Panel position="top-left">
                    <Segmented<GraphView> label={text('graphView')} value={view} onChange={setView} options={[{ value: 'pins', label: text('viewPins') }, { value: 'simple', label: text('viewSimple') }]} />
                  </Panel>
                )}
                {movable && Object.keys(manual).length > 0 && (
                  <Panel position="top-right">
                    <Button title={text('tidyUpHelp')} onClick={tidy}>
                      <LayoutGrid className="size-3.5" aria-hidden />
                      {text('tidyUp')}
                    </Button>
                  </Panel>
                )}
                <Controls showInteractive={false} />
                <FitOnLayout laidOut={laidOut} tidied={tidied} />
                {fills && <KeepCentre />}
                <MeasureOnLayout laidOut={boxes} ids={nodes.map((node) => node.id)} />
              </ReactFlow>
              {pins.offer && <PureOfferMenu offer={pins.offer} onClose={pins.closeOffer} />}
            </div>
          </WireCheckContext.Provider>
        </PinActionsContext.Provider>
      </UnpinContext.Provider>
    </AddAtContext.Provider>
  )
}

/**
 * The workflow's graph on a canvas, laid out by ELK each time it changes: the trigger, a node per state, a Map's states
 * inside it, and an edge per state it leads to. With `onChange` and `edits`, dragging from a handle connects states, a click on
 * one asks `onAddAt` for a step there, Delete removes the chosen state or edge, and each change is the definition edited.
 * With `onLayoutChange`, a node dragged stays where it is let go in the view shown, Pins or Simple, each keeping its own
 * places, marked, until Unpin on it or Tidy up hands it back to ELK, which lays the others out around it.
 */
export const WorkflowCanvas = (props: WorkflowCanvasProps) => (
  <ReactFlowProvider>
    <Canvas {...props} />
  </ReactFlowProvider>
)
