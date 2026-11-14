import { isInlineChild } from './inline-fields'
import type { LayoutChild, LayoutNode } from './node'

// A `Details` is HTML's <details>: its `Summary` comes first, as the line always shown, and a `Summary` sits in a
// `Details` only. The summary is one line, so what it holds runs inline.

const isSummary = (child: LayoutChild) => typeof child !== 'string' && !child.custom && child.type === 'Summary'

const isBlank = (child: LayoutChild) => typeof child === 'string' && child.trim() === ''

/** Problems of where a `Details`' `Summary` sits, and of what a `Summary` holds. */
export const detailsProblems = ({ type, children }: LayoutNode): string[] => {
  if (type === 'Summary') return children.every(isInlineChild) ? [] : ['holds text, <Link>s, <Text as="span">s and field components such as <TextField> only']
  const summaries = children.filter(isSummary).length
  if (type !== 'Details') return summaries > 0 ? ['holds a <Summary>, which only a <Details> takes'] : []
  const first = children.find((child) => !isBlank(child))
  if (summaries !== 1 || !first || !isSummary(first)) return ['takes one <Summary>, as its first child: the line shown while it is closed']
  return []
}
