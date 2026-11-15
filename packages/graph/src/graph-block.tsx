import { Spinner, useComponentReads, useComponentSelect } from '@protobase/ui'
import { lazy, Suspense, useMemo, type ReactNode } from 'react'
import type { GraphProps } from './layout'
import { graphShape, type GraphFields } from './graph-shape'

// The drawing library is a chunk of its own, which loads only when a graph draws
const GraphView = lazy(() => import('./graph-view').then((module) => ({ default: module.GraphView })))

const loading = (
  <div className="flex h-64 w-full items-center justify-center">
    <Spinner />
  </div>
)

/**
 * The `Graph` block: the records of `nodes` as boxes, grouped by `group` and coloured by `status`, and the records of
 * `edges` as arrows between them, from the reads the page's plan made. With `select`, each node links to the page with
 * it chosen, and the children draw beside the graph, inside the chosen node's record, or under it on a narrow screen.
 */
export const Graph = ({ label, group, status, source, target, empty, children }: Omit<GraphProps, 'nodes' | 'edges' | 'select'> & { children?: ReactNode }) => {
  const reads = useComponentReads()
  const select = useComponentSelect()
  const nodes = reads.nodes
  const edges = reads.edges
  const fields: GraphFields = useMemo(() => ({ label, source, target, ...(group !== undefined && { group }), ...(status !== undefined && { status }) }), [label, source, target, group, status])
  // The rows are new arrays on each render; the same records make the same shape, laid out once
  const signature = JSON.stringify([nodes?.rows, edges?.rows, fields])
  const shape = useMemo(() => nodes && edges && graphShape({ nodes: nodes.rows, edges: edges.rows, key: nodes.model.primaryKey[0]!, edgeKey: edges.model.primaryKey[0]!, fields }), [signature])
  if (!nodes || !edges || !shape) return null
  // A read that failed draws the block's fallback, as a component that throws does
  if (nodes.error) throw nodes.error
  if (edges.error) throw edges.error
  if (nodes.isPending || edges.isPending) return loading
  if (shape.nodes.length === 0) return empty ? <p className="text-body text-muted-foreground">{empty}</p> : null
  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="min-w-0 flex-1">
        <Suspense fallback={loading}>
          <GraphView shape={shape} model={nodes.model} view={nodes.view} fields={fields} {...(select && { select })} />
        </Suspense>
      </div>
      {/* With select, the children draw only once a node is chosen */}
      {children && (!select || select.chosen !== undefined) && <div className="min-w-0 lg:w-80 lg:shrink-0">{children}</div>}
    </div>
  )
}
