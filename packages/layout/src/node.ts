/** A static value a layout prop may hold: what survives `JSON.stringify` unchanged, plus elements (also plain data). */
export type LayoutValue = string | number | boolean | null | LayoutValue[] | { [key: string]: LayoutValue }

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
}

export type LayoutChild = LayoutNode | string

/** What JSX accepts as children; `null`, `undefined` and booleans render nothing, like in React. */
export type LayoutChildren = LayoutChild | number | boolean | null | undefined | LayoutChildren[]

/** A block as JSX sees it: called by the runtime with its props, it describes one element. */
export type Block<P> = ((props: P) => LayoutNode) & { readonly blockName: string; readonly custom: boolean; readonly fallback?: LayoutChild[] }

export const isLayoutNode = (value: unknown): value is LayoutNode =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && typeof (value as LayoutNode).type === 'string' && Array.isArray((value as LayoutNode).children)

/** An element's props without the elements it holds (`actions={...}`), which are walked as elements of their own. */
export const dataProps = (node: LayoutNode) =>
  Object.fromEntries(Object.entries(node.props).filter(([, value]) => !isLayoutNode(value) && !(Array.isArray(value) && value.length > 0 && value.every(isLayoutNode))))
