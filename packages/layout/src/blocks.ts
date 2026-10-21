import type { AppAddress, FieldFormat } from '@protobase/schema'
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
export type TableProps = DataProps &
  Heading & {
    columns?: string[]
    /** How many records it shows, the first in `sort` order; default 10. "View all" opens the rest in the list. */
    limit?: number
    /** The display of the resource's list it opens in, such as `cards`; the list's default when omitted. */
    display?: string
    empty?: string
    span?: GridSpan
  }
export type CardRowProps = DataProps & Heading & { limit?: number; empty?: string; span?: GridSpan; children?: LayoutChildren }
/**
 * What a filter finds, as the resource's list draws it: the filter's chips, how many records match, and the records as
 * the cards of `display` in one row that scrolls sideways, loading more as it scrolls, with "View all".
 */
export type RecordRowProps = DataProps &
  Heading & {
    /** How many records it shows at most; every one that matches when omitted. */
    limit?: number
    /** The cards display of the resource's view whose cards it draws; its first when omitted. */
    display?: string
    empty?: string
    span?: GridSpan
  }
/**
 * What a filter finds as the cards a record page's related section draws with `presentation: 'cards'`, stacked full
 * width under a heading that is not a card: each card its record's title linking to its page, its `fields` under their
 * labels with a long value cut short behind Show more, and its `cardActions`' buttons; "View all" opens the rest.
 */
export type RecordCardsProps = DataProps &
  Heading & {
    /** The fields each card shows, through relations too (`task_id.title`); the list's columns when omitted. */
    fields?: string[]
    /** Named actions of the resource's view, as buttons on each card. */
    cardActions?: string[]
    /** How many records it shows, the first in `sort` order (the list's when omitted); default 10. */
    limit?: number
    /** The display of the resource's list "View all" opens, such as `cards`; the list's default when omitted. */
    display?: string
    empty?: string
    span?: GridSpan
  }
/** How a chart draws its groups: bars, a line through a date field's buckets, or a donut of a field's values. */
export type ChartType = 'bar' | 'line' | 'donut'
/** How long each bucket of a chart over a date or timestamp field is. */
export type ChartBucket = 'hour' | 'day' | 'week' | 'month' | 'year'
/**
 * Records of `resource` matching `filter`, grouped and added up as a chart: how many have each value of `groupBy`, or
 * fall in each bucket of it when it is a date or timestamp field, or with `sum` or `average` that of a numeric field.
 */
export type ChartProps = Heading & {
  resource: string
  filter?: string
  /** A filterable field, such as an enum, a boolean or a relation; an index must serve it. */
  groupBy: string
  /** Default `bar`; `line` is for a date `groupBy`, `donut` for one of values. */
  type?: ChartType
  /** With a date `groupBy`: a filterable field of values that splits each bucket, as stacked bars or a line per value, its 8 largest values and the rest as Other; an index must serve it. */
  splitBy?: string
  /** A numeric field each group adds up, instead of counting its records. */
  sum?: string
  /** A numeric field each group averages, instead of counting its records. */
  average?: string
  /** A date `groupBy`'s bucket; default `day`. */
  granularity?: ChartBucket
  /** How far back a date `groupBy` reaches; default `30d`. */
  range?: '7d' | '30d' | '90d' | '1y' | 'all'
  /** How many values a chart of values shows, the largest; default 10. */
  limit?: number
  empty?: string
  span?: GridSpan
}
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
/**
 * A link: `to` an address in the app, `{field}` in it filled from the record around it, or an `href` that leaves the
 * app (`https:`, `mailto:`). One of the two.
 */
export type LinkProps = ({ to: AppAddress; href?: never } | { href: string; to?: never }) & { children?: LayoutChildren }

/** Everyone who can sign in, for admins: inviting by email, adding accounts, changing roles and blocking. Takes no props. */
export type UsersProps = Record<string, never>

export const Page = defineBlock<PageProps>('Page', false)
export const Grid = defineBlock<GridProps>('Grid', false)
export const Card = defineBlock<CardProps>('Card', false)
export const Stat = defineBlock<StatProps>('Stat', false)
export const RecordCard = defineBlock<RecordCardProps>('RecordCard', false)
export const Field = defineBlock<FieldProps>('Field', false)
export const Table = defineBlock<TableProps>('Table', false)
export const CardRow = defineBlock<CardRowProps>('CardRow', false)
export const RecordRow = defineBlock<RecordRowProps>('RecordRow', false)
export const RecordCards = defineBlock<RecordCardsProps>('RecordCards', false)
export const Chart = defineBlock<ChartProps>('Chart', false)
export const Progress = defineBlock<ProgressProps>('Progress', false)
export const ModalForm = defineBlock<ModalFormProps>('ModalForm', false)
export const Action = defineBlock<ActionProps>('Action', false)
export const Show = defineBlock<ShowProps>('Show', false)
export const Link = defineBlock<LinkProps>('Link', false)
export const Users = defineBlock<UsersProps>('Users', false)
