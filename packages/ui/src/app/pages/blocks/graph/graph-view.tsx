import { Controls, MarkerType, ReactFlow, ReactFlowProvider, useReactFlow, type Edge, type Node, type NodeChange } from '@xyflow/react'
import type { GraphFields, GraphProps, GraphShape } from '@protobase/layout'
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import type { ComponentRead, ComponentSelect } from '../../component-reads'
import { edgeConditionsOf, edgeLook } from './graph-edges'
import { contentWidth, nodeSize, type GraphLayout, type Size } from './graph-layout'
import { GroupNode, RecordNode, type GroupNodeData, type RecordNodeData, type Sides } from './graph-nodes'
import { useGraphLayout } from './use-graph-layout'
import '@xyflow/react/dist/style.css'

const nodeTypes = { record: RecordNode, 'group-box': GroupNode }

// The box's height follows the graph's shape at the box's width, within bounds, so the page scrolls past it
const minHeight = 256
const maxHeight = 'min(40rem, 70vh)'

// A graph wider than the box, as on a phone, stays readable and pans; the fit button shows all of it
const fitViewOptions = { minZoom: 0.6, maxZoom: 1 }

// The library's lines and controls in the app's tokens, over the page's own background: the variables it reads over
// its own defaults
const themed = {
  '--xy-edge-stroke': 'var(--color-border-strong)',
  '--xy-edge-stroke-width': '1.5',
  '--xy-background-color': 'transparent',
  '--xy-edge-label-background-color': 'var(--color-surface)',
  '--xy-edge-label-color': 'var(--color-muted-foreground)',
  '--xy-controls-button-background-color': 'var(--color-surface)',
  '--xy-controls-button-background-color-hover': 'var(--color-muted)',
  '--xy-controls-button-color': 'var(--color-foreground)',
  '--xy-controls-button-color-hover': 'var(--color-foreground)',
  '--xy-controls-button-border-color': 'var(--color-border)',
  '--xy-attribution-background-color': 'transparent',
} as CSSProperties

export type GraphViewProps = {
  shape: GraphShape
  nodes: Pick<ComponentRead, 'model' | 'view'>
  edges: Pick<ComponentRead, 'model' | 'view'>
  fields: GraphFields
  props: Pick<GraphProps, 'layout' | 'direction' | 'x' | 'y' | 'edgeLabel' | 'edgeStatus' | 'animated' | 'dashed' | 'dotted'>
  select?: ComponentSelect
  /** What each node draws, inside its record, the graph's `node`; its label and status without it. */
  content?: ReactNode
}

const number = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : undefined)

// The nodes React Flow draws: each group's region under the nodes, each node at its box, one with contents of its own
// as wide as they are given and as tall as they draw, which it measures
const flowNodes = ({ shape, nodes: read, fields, select, content }: GraphViewProps, layout: GraphLayout | undefined, sides: Sides): Node[] => {
  const drawn = { model: read.model, view: read.view, fields }
  const groups = shape.groups.flatMap((group): Node<GroupNodeData>[] => {
    const box = layout?.groups.get(group.id)
    const row = shape.nodes.find((node) => node.group === group.id)!.row
    return box ? [{ id: `group:${group.id}`, type: 'group-box', position: { x: box.x, y: box.y }, width: box.width, height: box.height, zIndex: -1, data: { ...drawn, row }, draggable: false, selectable: false, focusable: false }] : []
  })
  const nodes = shape.nodes.map((node): Node<RecordNodeData> => {
    const box = layout?.nodes.get(node.id)
    const chosen = select?.chosen === node.id
    return {
      id: `node:${node.id}`,
      type: 'record',
      position: box ? { x: box.x, y: box.y } : { x: 0, y: 0 },
      ...(content === undefined ? { width: nodeSize.width, height: nodeSize.height } : { style: { width: contentWidth } }),
      data: { ...drawn, row: node.row, chosen, sides, ...(content !== undefined && { content }), ...(select && { to: select.linkTo(node.id) }) },
      draggable: false,
      selectable: false,
    }
  })
  return [...groups, ...nodes]
}

const flowEdges = ({ shape, edges: read, props }: GraphViewProps, straight: boolean): Edge[] => {
  const conditions = edgeConditionsOf(props)
  return shape.edges.map((edge) => {
    const look = edgeLook(edge, props, conditions, read.view)
    return {
      id: `edge:${edge.id}`,
      source: `node:${edge.source}`,
      target: `node:${edge.target}`,
      ...(straight && { type: 'straight' }),
      markerEnd: { type: MarkerType.ArrowClosed, color: look.stroke },
      style: { stroke: look.stroke, ...(look.dash && { strokeDasharray: look.dash }) },
      animated: look.animated,
      ...(look.label !== undefined && { label: look.label, labelBgPadding: [4, 2] as [number, number], labelBgBorderRadius: 4 }),
      focusable: false,
      selectable: false,
    }
  })
}

// Fits the graph to its box each time it is laid out anew, as its first fit does, a frame later, once the nodes stand
// where the layout put them
const FitOnLayout = ({ layout }: { layout: GraphLayout | undefined }) => {
  const flow = useReactFlow()
  useEffect(() => {
    if (!layout) return
    const frame = requestAnimationFrame(() => void flow.fitView(fitViewOptions))
    return () => cancelAnimationFrame(frame)
  }, [flow, layout])
  return null
}

const Flow = (props: GraphViewProps) => {
  const { shape, content } = props
  const [measured, setMeasured] = useState<ReadonlyMap<string, Size>>(new Map())
  const sizes = useMemo(() => new Map(shape.nodes.map((node) => [node.id, content === undefined ? nodeSize : { width: contentWidth, height: measured.get(node.id)?.height ?? nodeSize.height }])), [shape, content, measured])
  const positions = useMemo(() => {
    const { x, y } = props.props
    if (x === undefined || y === undefined) return new Map<string, { x: number; y: number }>()
    return new Map(shape.nodes.flatMap((node) => {
      const at = { x: number(node.row[x]), y: number(node.row[y]) }
      return at.x === undefined || at.y === undefined ? [] : [[node.id, at as { x: number; y: number }]]
    }))
  }, [shape, props.props.x, props.props.y])
  const layoutName = props.props.layout ?? 'layered'
  const direction = props.props.direction ?? 'down'
  const layout = useGraphLayout(shape, { layout: layoutName, direction, sizes, positions })
  // A node with contents of its own is laid out at the height it draws at, so until each has drawn once the graph is
  // see-through: React Flow shows each node itself, so hiding the box would not hide them
  const ready = layout !== undefined && (content === undefined || shape.nodes.every((node) => measured.has(node.id)))
  const sides: Sides = layoutName === 'layered' && direction === 'right' ? 'horizontal' : 'vertical'
  const nodes = flowNodes(props, layout, sides)
  const edges = useMemo(() => flowEdges(props, layoutName === 'force'), [shape, props.edges.view, props.props, layoutName])
  const measure = (changes: NodeChange[]) => {
    const heights = changes.flatMap((change) => (change.type === 'dimensions' && change.dimensions && change.id.startsWith('node:') ? [[change.id.slice('node:'.length), change.dimensions] as const] : []))
    if (heights.length === 0) return
    setMeasured((before) => {
      const next = new Map(before)
      for (const [id, size] of heights) next.set(id, { width: Math.round(size.width), height: Math.round(size.height) })
      const same = next.size === before.size && [...next].every(([id, size]) => before.get(id)?.height === size.height)
      return same ? before : next
    })
  }
  return (
    <div className="w-full" style={{ ...themed, aspectRatio: layout ? `${Math.max(layout.width, 1)} / ${Math.max(layout.height, 1)}` : undefined, minHeight, maxHeight, ...(!ready && { opacity: 0 }) }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={content === undefined ? undefined : measure}
        fitView
        fitViewOptions={fitViewOptions}
        minZoom={0.1}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        edgesFocusable={false}
        zoomOnScroll={false}
        zoomOnDoubleClick={false}
        preventScrolling={false}
        zoomOnPinch
        panOnDrag
      >
        <FitOnLayout layout={ready ? layout : undefined} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}

/**
 * The graph in a box as wide as the page and as tall as its shape asks, within bounds, fitted to it unless that would
 * shrink it past reading: pinch or the zoom buttons zoom it, dragging pans it, and the wheel scrolls the page past it.
 * Read-only: nothing moves, connects or is deleted.
 */
export const GraphView = (props: GraphViewProps) => (
  <ReactFlowProvider>
    <Flow {...props} />
  </ReactFlowProvider>
)
