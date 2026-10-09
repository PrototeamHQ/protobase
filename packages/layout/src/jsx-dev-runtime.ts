import { createNode } from './create-node'
import type { LayoutNode } from './node'

// What development builds compile layout JSX to; the same elements as jsx-runtime.

export { Fragment, type JSX } from './jsx-runtime'

export const jsxDEV = (type: unknown, props: Record<string, unknown>): LayoutNode => createNode(type, props)
