import { definePlugin } from '@protobase/ui'
import { Graph } from './graph-block'

export { Graph } from './graph-block'

/**
 * The graph plugin: an app attaches it with `defineUi({ extends: [graph] })` in its `protobase.ui.tsx`, and draws the
 * `Graph` block of `@protobase/graph/layout` in its layouts. Its drawing library loads only when a graph draws.
 */
export default definePlugin({ name: 'graph', components: { Graph } })
