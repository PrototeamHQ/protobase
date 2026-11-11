import type { ReactNode } from 'react'
import type { LayoutNode } from '@protobase/layout'

/**
 * What every block gets: its element, its children already rendered, its element props (`actions`) rendered, and its
 * Tailwind classes, which it puts on its outer element.
 */
export type BlockProps = { node: LayoutNode; children: ReactNode[]; slots: Record<string, ReactNode>; className?: string }

/** The element's props in their declared shape; the server checked them against the block's spec. */
export const propsOf = <P,>(node: LayoutNode) => node.props as unknown as P
