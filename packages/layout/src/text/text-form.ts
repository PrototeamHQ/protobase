import type { LayoutNode } from '../node'
import { blocks } from './markdown'
import type { TableText } from './table-text'

/** How a field of the record around a tree reads: its label, and the labels of its enum values. */
export type TextFieldLabels = { label?: string; valueLabels?: Record<string, string> }

export type TextOptions = {
  /** Text forms by block type, over the built-in ones: a custom component's, or a built-in block's used, wrapped or replaced. */
  forms?: Record<string, TextForm>
  /** The record around the tree, whose values fields, stats, progress bars, conditions and addresses read. */
  record?: Record<string, unknown>
  /** The record's fields by path (`plan.name`); a field without a label reads under its path. */
  fields?: Record<string, TextFieldLabels>
  /** What a `Table` shows, which the caller loaded, so it reads as a Markdown table; a table without it reads as its heading. */
  tables?: (node: LayoutNode) => TableText | undefined
  /** The reader's locale, such as `nl-NL`, in which field components without `locales` format numbers and dates; the runtime's default when omitted. */
  locale?: string
  /** What the app's paths start with, such as `https://example.com/admin`; none when omitted. */
  basePath?: string
}

/** What a block's text form gets: its element, and the text of what it holds, already rendered. */
export type TextContext = {
  node: LayoutNode
  /**
   * The text of each child, in order. A run of text and links, as they read in one line, is one part, so joining the
   * parts with a separator never splits a sentence.
   */
  children: string[]
  /** The text of each element prop (`actions={...}`) by name, one part per element. */
  slots: Record<string, string[]>
  /** The text of a custom component's fallback, one part per child; absent when it declares none. */
  fallback?: string[]
  /** The options the tree renders with, and the record its scope has, if any. */
  options: TextOptions
}

/** A block's text form: Markdown for its element, from what it holds. */
export type TextForm = (context: TextContext) => string

/** The default text form: the children's text in order, a blank line between parts. Every container uses it as is. */
export const childrenText: TextForm = ({ children }) => blocks(children)
