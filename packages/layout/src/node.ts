/** A static value a layout prop may hold: what survives `JSON.stringify` unchanged, plus elements (also plain data). */
export type LayoutValue = string | number | boolean | null | LayoutValue[] | { [key: string]: LayoutValue }

/**
 * Which props of a block that reads records name what it reads: the resource, its filter, its sort, the fields it
 * draws and how many records it reads, so a page's reads can be planned from the tree. A block without one reads
 * nothing of its own. `fields` is a prop, or several, each holding a field name or a list of them. `select` is the
 * prop naming the page parameter that holds the key of the record chosen among them, inside which its children draw.
 */
export type BlockReads = { resource: string; filter?: string; sort?: string; fields?: string | string[]; limit?: string; select?: string }

/**
 * What a custom component reads: one read, or several, each named by the prop of its resource (`nodes`, `edges`), as
 * the page's plan names them.
 */
export type ComponentReads = BlockReads | BlockReads[]

/** One element of a layout tree. Plain data: it is sent to the browser as JSON and rendered there. */
export type LayoutNode = {
  /** A built-in block (`Table`) or a custom component's registered name. */
  type: string
  props: Record<string, LayoutValue>
  children: LayoutChild[]
  /** Set on custom components, which the app renders with the React component registered under `type`. */
  custom?: true
  /**
   * What a client draws in place of a custom component it does not have, or that fails to draw: elements and text,
   * or none to draw nothing. Absent when the component declares no fallback.
   */
  fallback?: LayoutChild[]
  /** Which of a custom component's props name what it reads, as its `component()` declares, so the page's plan reads it. */
  reads?: ComponentReads
}

export type LayoutChild = LayoutNode | string

/** What JSX accepts as children; `null`, `undefined` and booleans render nothing, like in React. */
export type LayoutChildren = LayoutChild | number | boolean | null | undefined | LayoutChildren[]

/** A block as JSX sees it: called by the runtime with its props, it describes one element. */
export type Block<P> = ((props: P) => LayoutNode) & { readonly blockName: string; readonly custom: boolean; readonly fallback?: LayoutChild[]; readonly reads?: ComponentReads }

export const isLayoutNode = (value: unknown): value is LayoutNode =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && typeof (value as LayoutNode).type === 'string' && Array.isArray((value as LayoutNode).children)

/** An element's props without the elements it holds (`actions={...}`), which are walked as elements of their own. */
export const dataProps = (node: LayoutNode) =>
  Object.fromEntries(Object.entries(node.props).filter(([, value]) => !isLayoutNode(value) && !(Array.isArray(value) && value.length > 0 && value.every(isLayoutNode))))
