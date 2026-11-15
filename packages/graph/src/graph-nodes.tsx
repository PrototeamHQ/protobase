import { FieldBadge, RouteLink, ToneEdge, type ComponentRead, type RouteTarget } from '@protobase/ui'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { GraphFields } from './graph-shape'

type Drawn = Pick<ComponentRead, 'model' | 'view'> & { fields: GraphFields }

/** A node as it draws: its record, the link that chooses it when the graph has `select`, and whether it is chosen. */
export type RecordNodeData = Drawn & { row: Record<string, unknown>; to?: RouteTarget; chosen: boolean }

/** A group as it draws: the record of one of its nodes, whose `group` value it shows. */
export type GroupNodeData = Drawn & { row: Record<string, unknown> }

// Edges attach at the top and bottom; the handles take no part in the drawing, since the graph cannot be edited
const handle = 'pointer-events-none !min-h-0 !min-w-0 !border-0 !bg-transparent'

/** A node: its label, linking to the page with it chosen, over its status, the status colouring its left edge. */
export const RecordNode = ({ data }: NodeProps<Node<RecordNodeData, 'record'>>) => {
  const { model, view, fields, row, to, chosen } = data
  const label = String(row[fields.label] ?? '')
  return (
    <div data-chosen={chosen || undefined} className={`relative flex size-full flex-col justify-center gap-1 rounded-lg border bg-surface px-3 py-2 text-body ${chosen ? 'border-primary ring-2 ring-primary/40' : 'border-border'}`}>
      <Handle type="target" position={Position.Top} isConnectable={false} className={handle} />
      {fields.status && <ToneEdge view={view} field={fields.status} record={row} />}
      {/* React Flow turns pointer events off on a node that cannot be dragged or selected; its link takes them back */}
      {to ? (
        <RouteLink to={to} aria-current={chosen || undefined} className="pointer-events-auto line-clamp-2 min-w-0 font-medium [overflow-wrap:anywhere] text-primary-text hover:underline">
          {label}
        </RouteLink>
      ) : (
        <span className="line-clamp-2 min-w-0 font-medium [overflow-wrap:anywhere]">{label}</span>
      )}
      {fields.status && (
        <div className="flex">
          <FieldBadge model={model} view={view} field={fields.status} record={row} />
        </div>
      )}
      <Handle type="source" position={Position.Bottom} isConnectable={false} className={handle} />
    </div>
  )
}

/** A group: a box around its nodes, its `group` value at its top. */
export const GroupNode = ({ data }: NodeProps<Node<GroupNodeData, 'group-box'>>) => (
  <div className="size-full rounded-xl border border-dashed border-border-strong bg-muted/40">
    {data.fields.group && (
      <div className="flex px-2 pt-0.5 text-xs">
        <FieldBadge model={data.model} view={data.view} field={data.fields.group} record={data.row} />
      </div>
    )}
  </div>
)
