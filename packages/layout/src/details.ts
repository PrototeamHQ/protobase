import { defineBlock } from './create-node'
import type { Styled } from './blocks'
import type { LayoutChildren } from './node'

// HTML's <details> and <summary> (https://developer.mozilla.org/en-US/docs/Web/HTML/Element/details): a line that
// opens to show more and closes again, by the browser alone.

/** A `Summary`, its first child, and what it shows when open. `open` shows it open at first. */
export type DetailsProps = Styled & { open?: boolean; children?: LayoutChildren }
/** The line of a `Details` that is always shown: text, links, `Text as="span"`s and field components. */
export type SummaryProps = Styled & { children?: LayoutChildren }

export const Details = defineBlock<DetailsProps>('Details', false)
export const Summary = defineBlock<SummaryProps>('Summary', false)
