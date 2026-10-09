import type { NavModel } from '@protobase/schema'
import { structureProblems } from './check-structure'
import type { LayoutNode } from './node'

/** A composed page as `/api/meta` serves it. */
export type PageModel = {
  /** Its address: the page is at `/<name>`, beside the resources, so no resource may have the same name. */
  name: string
  /** The root `Page` element's title. */
  title: string
  icon?: string
  nav?: NavModel
  /** Shown only to users with one of these roles; a page without roles is for everyone who can sign in. */
  roles?: string[]
  tree: LayoutNode
}

export type PageOptions = Pick<PageModel, 'icon' | 'nav' | 'roles'>

export type PageDefinition = { readonly kind: 'page'; readonly name: string; toModel(): PageModel }

const pageName = /^[a-z][a-zA-Z0-9-]*$/

/**
 * A composed page at `/<name>`. Checks the tree right away, so a broken layout stops the config from loading; the
 * resources, fields, filters and actions it names are checked against the models when the server starts.
 */
export const page = (name: string, tree: LayoutNode, options: PageOptions = {}): PageDefinition => {
  if (!pageName.test(name)) throw new Error(`Page name "${name}" must start with a lowercase letter and hold only letters, digits and dashes`)
  const problems = structureProblems(tree)
  if (problems.length > 0) throw new Error(`Page "${name}" is not a valid layout:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`)
  const model: PageModel = { name, title: String(tree.props.title), tree, ...options }
  return { kind: 'page', name, toModel: () => structuredClone(model) }
}

export const isPageDefinition = (value: unknown): value is PageDefinition =>
  typeof value === 'object' && value !== null && (value as PageDefinition).kind === 'page' && typeof (value as PageDefinition).toModel === 'function'
