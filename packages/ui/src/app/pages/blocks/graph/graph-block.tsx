import { graphShape, type GraphFields, type GraphProps } from '@protobase/layout'
import { lazy, Suspense, useMemo } from 'react'
import { cn } from '../../../../lib/cn'
import { Spinner } from '../../../../primitives/spinner'
import { ErrorBanner } from '../../../error-banner'
import { useElementReads, type ComponentSelect } from '../../component-reads'
import { CustomChosen } from '../../custom-chosen'
import { text } from '../../messages'
import { usePageParamsIfAny } from '../../page-params'
import { propsOf, type BlockProps } from '../block-props'
import { Quiet } from '../card-frame'

// The drawing library is a chunk of its own, which loads only when a graph draws
const GraphView = lazy(() => import('./graph-view').then((module) => ({ default: module.GraphView })))

const loading = (
  <div className="flex h-64 w-full items-center justify-center">
    <Spinner />
  </div>
)

/**
 * The `Graph` block: the records of `nodes` as boxes, each in the region of its `group` and coloured by its `status`,
 * drawing `node` inside its record where the graph has one, and the records of `edges` as arrows between them, from the
 * reads the page's plan made. With `select`, each node links to the page with it chosen, and the children draw beside
 * the graph, inside the chosen node's record, or under it on a narrow screen. A read that fails draws its fallback.
 */
export const GraphBlock = ({ node, at, slots, children, className }: BlockProps) => {
  const props = propsOf<GraphProps>(node)
  const reads = useElementReads(node, at)
  const params = usePageParamsIfAny()
  const nodes = reads.nodes
  const edges = reads.edges
  const { label, group, status, source, target } = props
  const fields: GraphFields = useMemo(() => ({ label, source, target, ...(group !== undefined && { group }), ...(status !== undefined && { status }) }), [label, source, target, group, status])
  // The rows are new arrays on each render; the same records make the same shape, laid out once
  const signature = JSON.stringify([nodes?.rows, edges?.rows, fields])
  const shape = useMemo(() => nodes && edges && graphShape({ nodes: nodes.rows, edges: edges.rows, key: nodes.model.primaryKey[0]!, edgeKey: edges.model.primaryKey, fields }), [signature])
  if (!nodes || !edges || !shape) return null
  const error = nodes.error ?? edges.error
  // Its fallback stands in where it declares one, as for a component that throws
  if (error && node.fallback) throw error
  if (error) return <ErrorBanner title={text('couldNotLoad')} error={error} />
  if (nodes.isPending || edges.isPending) return loading
  if (shape.nodes.length === 0) return <Quiet>{props.empty ?? text('nothingYet')}</Quiet>
  const param = props.select
  const select: ComponentSelect | undefined = param !== undefined && params ? { chosen: params.given[param], linkTo: (key) => params.linkTo({ [param]: key }) } : undefined
  return (
    <div className={cn('flex flex-col gap-4 lg:flex-row', className)}>
      <div className="min-w-0 flex-1">
        <Suspense fallback={loading}>
          <GraphView shape={shape} nodes={nodes} edges={edges} fields={fields} props={props} {...(select && { select })} {...(props.node !== undefined && { content: slots.node })} />
        </Suspense>
      </div>
      {/* The children draw once a node is chosen, inside its record */}
      {children.length > 0 && select?.chosen !== undefined && (
        <div className="min-w-0 lg:w-80 lg:shrink-0">
          <CustomChosen node={node}>{children}</CustomChosen>
        </div>
      )}
    </div>
  )
}
