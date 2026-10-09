import type { FieldFormat } from '@protobase/schema'
import { defineBlock } from './create-node'
import type { LayoutChildren, LayoutNode, LayoutValue } from './node'

/** One element or several, for slots such as a card's header `actions`. */
export type Elements = LayoutNode | LayoutNode[]

/** How many grid columns an element spans when it sits in a `Grid`. */
export type GridSpan = 1 | 2 | 3 | 4

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

/** Records of `resource` matching `filter` (AIP-160, like the API's `filter`) in `sort` order (AIP-132, like `order_by`). */
export type DataProps = { resource: string; filter?: string; sort?: string }

type Heading = { title?: string; description?: string; actions?: Elements }

export type PageProps = { title: string; description?: string; actions?: Elements; children?: LayoutChildren }
export type GridProps = { columns?: 1 | 2 | 3 | 4; span?: GridSpan; children?: LayoutChildren }
export type CardProps = Heading & { span?: GridSpan; children?: LayoutChildren }
export type StatProps = {
  label: string
  /** A fixed value. */
  value?: string | number
  /** Counts the records of `resource` that match `filter`, and links to that list. */
  resource?: string
  filter?: string
  /** A field of the record around it, such as `plan.name`. */
  field?: string
  format?: FieldFormat
  description?: string
  span?: GridSpan
}
export type RecordCardProps = DataProps & Heading & { recordKey?: string; empty?: string; span?: GridSpan; children?: LayoutChildren }
export type FieldProps = { name: string; label?: string | false; format?: FieldFormat }
export type TableProps = DataProps & Heading & { columns?: string[]; pageSize?: number; empty?: string; span?: GridSpan }
export type CardRowProps = DataProps & Heading & { limit?: number; empty?: string; span?: GridSpan; children?: LayoutChildren }
export type ProgressProps = {
  /** A number, or a field of the record around it. */
  value: number | string
  /** A number or a field; default 100. */
  max?: number | string
  label?: string
  span?: GridSpan
}
export type ModalFormProps = {
  mode: 'create' | 'edit'
  /** The button that opens the form. */
  label: string
  fields: string[]
  /** Default: the resource of the record around it. */
  resource?: string
  recordKey?: string
  /** The dialog's title; default: the label. */
  title?: string
  /** Values sent with every create, such as the parent record's key. */
  values?: Record<string, LayoutValue>
  variant?: ButtonVariant
}
export type ActionProps = { name: string; resource?: string; label?: string; variant?: ButtonVariant }
export type ShowProps = { when: string; children?: LayoutChildren }
export type LinkProps = { href: string; children?: LayoutChildren }

export const Page = defineBlock<PageProps>('Page', false)
export const Grid = defineBlock<GridProps>('Grid', false)
export const Card = defineBlock<CardProps>('Card', false)
export const Stat = defineBlock<StatProps>('Stat', false)
export const RecordCard = defineBlock<RecordCardProps>('RecordCard', false)
export const Field = defineBlock<FieldProps>('Field', false)
export const Table = defineBlock<TableProps>('Table', false)
export const CardRow = defineBlock<CardRowProps>('CardRow', false)
export const Progress = defineBlock<ProgressProps>('Progress', false)
export const ModalForm = defineBlock<ModalFormProps>('ModalForm', false)
export const Action = defineBlock<ActionProps>('Action', false)
export const Show = defineBlock<ShowProps>('Show', false)
export const Link = defineBlock<LinkProps>('Link', false)
