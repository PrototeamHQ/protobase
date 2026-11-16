import { normalizeChildren } from '../create-node'
import { Fragment } from '../jsx-runtime'
import type { LayoutChildren, LayoutNode } from '../node'
import { childScope, pageScope, propScope, type Scope } from '../walk'
import { recorder, resolveScopes, resourcesRecorder, whileBuilding } from './record'
import type { RecordOf, Recorded, ResourceName, Resources } from './types'

// One element for what a layout function returns: itself, or a fragment around several, with each recorded path
// written as it reads where it ends up
const oneNode = (build: () => LayoutChildren, where: string, root: Scope = pageScope): LayoutNode => {
  const nodes = whileBuilding(() => normalizeChildren(build(), where))
  const [only] = nodes
  const tree = nodes.length === 1 && typeof only === 'object' ? only : Fragment({ children: nodes })
  return resolveScopes(tree, root, (node, scope: Scope) => ({ children: childScope(node as LayoutNode, scope), slots: propScope(node as LayoutNode, scope), depth: (at: Scope) => at.stack.length }))
}

/**
 * A page's tree, written with the app's tables in hand: `layout(({ resources }) => <Page>…</Page>)`. It is built once,
 * as the config loads, into the same static tree as JSX written without it; `resources.<name>.count` reads in a
 * condition, such as `<Show when={resources.loop_held.count.gt(0)}>`.
 */
export const layout = (build: (scope: { resources: Resources; data: Recorded<Record<string, unknown>> }) => LayoutChildren): LayoutNode =>
  oneNode(() => build({ resources: resourcesRecorder() as Resources, data: recorder() as Recorded<Record<string, unknown>> }), '<layout>')

/**
 * A tree drawn from data of the type `Data`, such as an email's, written with the data in hand: `data.name` is
 * `{{name}}` where it ends up as text, and `data.lines` a list an `ArrayField` repeats. Built once into a static tree.
 */
export const dataLayout = <Data extends object>(build: (scope: { data: Recorded<Data> }) => LayoutChildren): LayoutNode => oneNode(() => build({ data: recorder() as Recorded<Data> }), '<dataLayout>')

/**
 * Blocks for the record page of `resource`, written with its record in hand: `data.title` is `{{title}}` where it
 * ends up as text, typed by the resource's fields, and `f.task_id.eq(data.id)` a filter on it. Hand the result to
 * `l.blocks(...)` in the resource's view.
 */
export const recordLayout = <R extends ResourceName>(
  resource: R,
  build: (scope: { data: Recorded<RecordOf<R>>; resources: Resources }) => LayoutChildren,
): LayoutNode => {
  if (typeof resource !== 'string' || (resource as string) === '') throw new Error('recordLayout(resource, build) takes the name of the resource whose record page it draws')
  return oneNode(() => build({ data: recorder() as Recorded<RecordOf<R>>, resources: resourcesRecorder() as Resources }), `<recordLayout ${resource}>`, { stack: [], root: resource })
}
