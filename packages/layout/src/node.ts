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
}

export type LayoutChild = LayoutNode | string

/** What JSX accepts as children; `null`, `undefined` and booleans render nothing, like in React. */
export type LayoutChildren = LayoutChild | number | boolean | null | undefined | LayoutChildren[]

/** A block as JSX sees it: called by the runtime with its props, it describes one element. */
export type Block<P> = ((props: P) => LayoutNode) & { readonly blockName: string; readonly custom: boolean }

export const isLayoutNode = (value: unknown): value is LayoutNode =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && typeof (value as LayoutNode).type === 'string' && Array.isArray((value as LayoutNode).children)
