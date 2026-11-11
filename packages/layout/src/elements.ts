import { defineBlock } from './create-node'
import type { Styled } from './blocks'
import type { LayoutChildren } from './node'

// Plain building elements, for a page too custom for the blocks: they carry no look of their own beyond what their
// name says, and take it from their Tailwind classes. Semantic blocks stay the better choice where one fits.

/** An element of its own, such as a panel or a banner. */
export type BoxProps = Styled & { children?: LayoutChildren }
/** Its children side by side, in a row. */
export type RowProps = Styled & { children?: LayoutChildren }
/** Its children one under another, in a column. */
export type ColumnProps = Styled & { children?: LayoutChildren }

/** What a `Text` is: a paragraph, a piece of a line, or a heading of a level. */
export type TextAs = 'p' | 'span' | 'h1' | 'h2' | 'h3' | 'h4'
/** Text, and `Link`s and `Text as="span"`s in it: a paragraph unless `as` says otherwise. */
export type TextProps = Styled & { as?: TextAs; children?: LayoutChildren }

export const Box = defineBlock<BoxProps>('Box', false)
export const Row = defineBlock<RowProps>('Row', false)
export const Column = defineBlock<ColumnProps>('Column', false)
export const Text = defineBlock<TextProps>('Text', false)
