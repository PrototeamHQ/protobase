import type { ReactNode } from 'react'
import type { LayoutNode } from '@protobase/layout'

/** What every block gets: its element, its children already rendered, and its element props (`actions`) rendered. */
export type BlockProps = { node: LayoutNode; children: ReactNode[]; slots: Record<string, ReactNode> }

/** The element's props in their declared shape; the server checked them against the block's spec. */
export const propsOf = <P,>(node: LayoutNode) => node.props as unknown as P
