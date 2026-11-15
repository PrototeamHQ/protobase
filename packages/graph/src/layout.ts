import { component, type BlockReads, type LayoutChildren } from '@protobase/layout'

export { graphText } from './graph-text'

/** The props of a `Graph`, in React Flow's terms: `nodes` and `edges` are resources, the others fields of them. */
export type GraphProps = {
  /** The resource whose records are the nodes, each by its key. */
  nodes: string
  /** The resource whose records are the edges, each from the node its `source` field holds to the one its `target` holds. */
  edges: string
  /** The field of a node that labels it. */
  label: string
  /** The field of a node whose value groups it with the nodes that hold the same. */
  group?: string
  /** The enum field of a node that colours it, as its view's `valueColors` give each value. */
  status?: string
  /** The field of an edge that holds the key of the node it starts at. */
  source: string
  /** The field of an edge that holds the key of the node it ends at. */
  target: string
  /** The page parameter that holds the chosen node's key: each node links to the page with it chosen, and the children draw inside it. */
  select?: string
  /** What it shows without nodes. */
  empty?: string
}

/** What a `Graph` reads, which the page's plan reads at page load, so the plugin fetches nothing itself. */
export const graphReads: BlockReads[] = [
  { resource: 'nodes', fields: ['label', 'group', 'status'], select: 'select' },
  { resource: 'edges', fields: ['source', 'target'] },
]

/** The name of the plugin that draws a `Graph`. */
export const graphPlugin = 'graph'

/**
 * Declares the `Graph` block with `fallback`, what a client that cannot draw it shows instead, such as an
 * `<Image function="...">` of the app's that draws the same graph as a picture.
 */
export const graph = ({ fallback }: { fallback?: LayoutChildren } = {}) => component<GraphProps>('Graph', { plugin: graphPlugin, reads: graphReads, ...(fallback !== undefined && { fallback }) })

/** The `Graph` block without a fallback: where it cannot be drawn, its text form stands in. */
export const Graph = graph()
