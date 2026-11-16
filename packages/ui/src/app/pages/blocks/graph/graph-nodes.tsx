import type { GraphFields } from '@protobase/layout'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { ReactNode } from 'react'
import { RouteLink, type RouteTarget } from '../../../../primitives/route-link'
import { FieldBadge } from '../../../field-badge'
import { ToneEdge } from '../../../related-cards/tone-edge'
import { RecordScope } from '../../record-scope'
import { scopeOf } from '../../use-layout-data'

type Drawn = { model: ResourceModel; view: ViewModel | undefined; fields: GraphFields }

/** Which sides a node's edges meet it on: the top and bottom for a graph that runs down, else the left and right. */
export type Sides = 'vertical' | 'horizontal'

/**
 * A node as it draws: its record, what the graph draws in each node, the link that chooses it when the graph has
 * `select`, whether it is chosen, and which sides its edges meet.
 */
export type RecordNodeData = Drawn & { row: Record<string, unknown>; content?: ReactNode; to?: RouteTarget; chosen: boolean; sides: Sides }

/** A group as it draws: the record of one of its nodes, whose `group` value it shows. */
export type GroupNodeData = Drawn & { row: Record<string, unknown> }

// The handles take no part in the drawing, since the graph cannot be edited
const handle = 'pointer-events-none !min-h-0 !min-w-0 !border-0 !bg-transparent'

const Handles = ({ sides }: { sides: Sides }) => (
  <>
    <Handle type="target" position={sides === 'vertical' ? Position.Top : Position.Left} isConnectable={false} className={handle} />
    <Handle type="source" position={sides === 'vertical' ? Position.Bottom : Position.Right} isConnectable={false} className={handle} />
  </>
)

const frame = (chosen: boolean) => `relative rounded-lg border bg-surface text-body ${chosen ? 'border-primary ring-2 ring-primary/40' : 'border-border'}`

/**
 * A node: with contents of the graph's own, those, drawn inside its record, the whole node a link that chooses it; else
 * its label, linking to the page with it chosen, over its status badge. Its status colours its left edge.
 */
export const RecordNode = ({ data }: NodeProps<Node<RecordNodeData, 'record'>>) => {
  const { model, view, fields, row, content, to, chosen, sides } = data
  const label = String(row[fields.label] ?? '')
  const edge = fields.status && <ToneEdge view={view} field={fields.status} record={row} />
  if (content !== undefined) {
    return (
      <div data-chosen={chosen || undefined} className={`${frame(chosen)} flex w-full flex-col gap-1 px-3 py-2`}>
        <Handles sides={sides} />
        {edge}
        {/* A link over the whole node chooses it, under the contents, whose own links stay theirs; React Flow turns
            pointer events off on a node that cannot be dragged or selected, so each takes them back */}
        {to && <RouteLink to={to} aria-label={label} aria-current={chosen || undefined} className="pointer-events-auto absolute inset-0 rounded-lg hover:bg-muted/40" />}
        <div className="relative min-w-0 [overflow-wrap:anywhere] [&_a]:pointer-events-auto">
          <RecordScope value={scopeOf(model, row)}>{content}</RecordScope>
        </div>
      </div>
    )
  }
  return (
    <div data-chosen={chosen || undefined} className={`${frame(chosen)} flex size-full flex-col justify-center gap-1 px-3 py-2`}>
      <Handles sides={sides} />
      {edge}
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
    </div>
  )
}

/** A group: a region around its nodes, its `group` value at its top. */
export const GroupNode = ({ data }: NodeProps<Node<GroupNodeData, 'group-box'>>) => (
  <div className="size-full rounded-xl border border-dashed border-border-strong bg-muted/40">
    {data.fields.group && (
      <div className="flex px-2 pt-1 text-xs">
        <FieldBadge model={data.model} view={data.view} field={data.fields.group} record={data.row} />
      </div>
    )}
  </div>
)
