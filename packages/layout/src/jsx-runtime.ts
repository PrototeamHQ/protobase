import { createNode, defineBlock, fragmentName } from './create-node'
import type { Block, LayoutChildren, LayoutNode } from './node'

// The automatic JSX runtime for layout files (`/** @jsxImportSource @protobase/layout */`): elements become plain data.

export const Fragment = defineBlock<{ children?: LayoutChildren }>(fragmentName, false)

export const jsx = (type: unknown, props: Record<string, unknown>): LayoutNode => createNode(type, props)

export const jsxs = jsx

export declare namespace JSX {
  type Element = LayoutNode
  type ElementType = Block<any>
  interface ElementChildrenAttribute {
    children: {}
  }
  interface IntrinsicElements {}
  interface IntrinsicAttributes {
    key?: string | number
  }
}
