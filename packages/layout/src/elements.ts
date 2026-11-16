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

/** What a `Text` is: a paragraph, a piece of a line, plain, strong or emphasised, or a heading of a level. */
export type TextAs = 'p' | 'span' | 'strong' | 'em' | 'h1' | 'h2' | 'h3' | 'h4'
/** Text, and `Link`s and `Text as="span"`s in it: a paragraph unless `as` says otherwise. */
export type TextProps = Styled & { as?: TextAs; children?: LayoutChildren }

export const Box = defineBlock<BoxProps>('Box', false)
export const Row = defineBlock<RowProps>('Row', false)
export const Column = defineBlock<ColumnProps>('Column', false)
export const Text = defineBlock<TextProps>('Text', false)

/** An email's own root: its text, drawn on the app's mail card. `defineTemplate` puts the template's body in one. */
export type EmailProps = { children?: LayoutChildren }
/** An email's action: a button that opens `href`, a full address, which the plain-text part writes beside its label. */
export type ButtonProps = Styled & { href: string; children?: LayoutChildren }
/** A rule across an email, between its parts. */
export type DividerProps = Styled

export const Email = defineBlock<EmailProps>('Email', false)
export const Button = defineBlock<ButtonProps>('Button', false)
export const Divider = defineBlock<DividerProps>('Divider', false)
