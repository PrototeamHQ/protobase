import flowStyles from '@xyflow/react/dist/style.css?inline'
import { Controls, MarkerType, ReactFlow, type Edge, type Node } from '@xyflow/react'
import type { ComponentRead, ComponentSelect } from '@protobase/ui'
import { useMemo, type CSSProperties } from 'react'
import { graphLayout, type GraphLayout } from './graph-layout'
import { GroupNode, RecordNode, type GroupNodeData, type RecordNodeData } from './graph-nodes'
import type { GraphFields, GraphShape } from './graph-shape'

const nodeTypes = { record: RecordNode, 'group-box': GroupNode }

// Room above a group's nodes for its value
const groupHead = 16

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
  '--xy-controls-button-background-color': 'var(--color-surface)',
  '--xy-controls-button-background-color-hover': 'var(--color-muted)',
  '--xy-controls-button-color': 'var(--color-foreground)',
  '--xy-controls-button-color-hover': 'var(--color-foreground)',
  '--xy-controls-button-border-color': 'var(--color-border)',
  '--xy-attribution-background-color': 'transparent',
} as CSSProperties

export type GraphViewProps = Pick<ComponentRead, 'model' | 'view'> & { shape: GraphShape; fields: GraphFields; select?: ComponentSelect }

// The nodes React Flow draws: each group first, then each node inside its group, placed from its group's corner
const flowNodes = ({ shape, model, view, fields, select }: GraphViewProps, layout: GraphLayout): Node[] => {
  const drawn = { model, view, fields }
  const groups = shape.groups.map((group): Node<GroupNodeData> => {
    const box = layout.groups.get(group.id)!
    const row = shape.nodes.find((node) => node.group === group.id)!.row
    return { id: `group:${group.id}`, type: 'group-box', position: { x: box.x, y: box.y - groupHead }, width: box.width, height: box.height + groupHead, data: { ...drawn, row }, draggable: false, selectable: false, focusable: false }
  })
  const nodes = shape.nodes.map((node): Node<RecordNodeData> => {
    const box = layout.nodes.get(node.id)!
    const parent = node.group === undefined ? undefined : layout.groups.get(node.group)
    const position = parent ? { x: box.x - parent.x, y: box.y - parent.y + groupHead } : { x: box.x, y: box.y }
    const chosen = select?.chosen === node.id
    return {
      id: `node:${node.id}`,
      type: 'record',
      position,
      width: box.width,
      height: box.height,
      ...(node.group !== undefined && { parentId: `group:${node.group}` }),
      data: { ...drawn, row: node.row, chosen, ...(select && { to: select.linkTo(node.id) }) },
      draggable: false,
      selectable: false,
    }
  })
  return [...groups, ...nodes]
}

const flowEdges = (shape: GraphShape): Edge[] =>
  shape.edges.map((edge) => ({ id: `edge:${edge.id}`, source: `node:${edge.source}`, target: `node:${edge.target}`, markerEnd: { type: MarkerType.ArrowClosed }, focusable: false, selectable: false }))

/**
 * The graph in a box as wide as the page and as tall as its shape asks, within bounds, fitted to it unless that would
 * shrink it past reading: pinch or the zoom buttons zoom it, dragging pans it, and the wheel scrolls the page past it. Read-only: nothing moves, connects or is deleted.
 */
export const GraphView = (props: GraphViewProps) => {
  // Laid out once per shape; the nodes only take the chosen one and the links from it
  const layout = useMemo(() => graphLayout(props.shape), [props.shape])
  const edges = useMemo(() => flowEdges(props.shape), [props.shape])
  const nodes = flowNodes(props, layout)
  return (
    <div className="w-full" style={{ ...themed, aspectRatio: `${layout.width} / ${layout.height + groupHead}`, minHeight, maxHeight }}>
      <style>{flowStyles}</style>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
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
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
