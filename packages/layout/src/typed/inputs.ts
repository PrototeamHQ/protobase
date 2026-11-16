import type {
  ActionProps,
  CardProps,
  CardRowProps,
  ChartProps,
  ComposerProps,
  FieldProps,
  MatchProps,
  ModalFormProps,
  PageProps,
  RecordCardProps,
  RecordCardsProps,
  RecordRowProps,
  SettingsProps,
  ShowProps,
  StatProps,
  Styled,
  TabProps,
  TableProps,
  ThreadProps,
  TimelineProps,
} from '../block-props'
import type { ArrayFieldProps, ReferenceArrayFieldProps, ReferenceFieldProps, ReferenceManyFieldProps } from '../list-block-props'
import type { LayoutChildren, LayoutNode } from '../node'
import type { Condition } from './record'
import type { FieldName, Filter, RecordOf, Recorded, Sort } from './types'

// What a block takes as it is written, beside the static props it is stored with: the resource's names typed, a filter
// as an arrow, a sort as a list, text as a <Trans>, and a record block's children as a function of its record

/**
 * Text a block shows: written as it is, with `{{path}}` placeholders or a typed layout's `${data.title}`, or a
 * `<Trans i18nKey="…" />` in the reader's language.
 */
export type Text = string | LayoutNode

/** A record block's children, or a function of its record: `(run) => <Text>{run.outcome}</Text>`. */
export type RecordChildren<R extends string> = LayoutChildren | ((record: Recorded<RecordOf<R>>) => LayoutChildren)

/** A column of a table: a field, or a field with its importance at mobile width, 1 the most important. */
export type TableColumn<R extends string> = FieldName<R> | { name: FieldName<R>; priority: number }

/** A field of the resource, or one through a relation, such as `task_id.title`. */
export type FieldPath<R extends string> = FieldName<R> | `${FieldName<R>}.${string}`

/** A condition: the builder's, `data.status.eq('done')`, or AIP-160 text. */
export type When = string | Condition

type Texts = { title?: Text; description?: Text; empty?: Text; label?: Text }
type Written<P, O> = Omit<P, keyof O | keyof Texts> & { [K in Exclude<keyof Texts & keyof P, keyof O>]?: Text } & O & Styled

/** Records of `resource` matching `filter`, in `sort` order, typed by the resource. */
type Data<R extends string> = { resource: R; filter?: Filter<R>; sort?: Sort<R>[] }

export type PageInput = Written<PageProps, { title: Text }>
export type CardInput = Written<CardProps, {}>
export type FieldInput = Written<FieldProps, { label?: Text | false }>
export type ShowInput = Written<ShowProps, { when: When }>
export type MatchInput = Written<MatchProps, { when: When }>
export type TabInput = Written<TabProps, { label: Text }>
export type StatInput<R extends string> = Written<StatProps, { label: Text; resource?: R; filter?: Filter<R> }>
export type RecordCardInput<R extends string> = Written<RecordCardProps, Data<R> & { children?: RecordChildren<R> }>
export type TableInput<R extends string> = Written<TableProps, Partial<Data<R>> & { columns?: TableColumn<R>[] }>
export type CardRowInput<R extends string> = Written<CardRowProps, Data<R> & { children?: RecordChildren<R> }>
export type RecordRowInput<R extends string> = Written<RecordRowProps, Data<R>>
export type RecordCardsInput<R extends string> = Written<RecordCardsProps, Data<R> & { fields?: FieldPath<R>[] }>
export type ChartInput<R extends string> = Written<
  ChartProps,
  { resource: R; filter?: Filter<R>; groupBy: FieldName<R>; splitBy?: FieldName<R>; sum?: FieldName<R>; average?: FieldName<R> }
>
export type TimelineInput<R extends string> = Written<
  TimelineProps,
  { resource: R; filter?: Filter<R>; lane: FieldName<R>; bar: FieldName<R>; start: FieldName<R>; end: FieldName<R>; color: FieldName<R> }
>
export type ModalFormInput<R extends string> = Written<ModalFormProps, { label: Text; resource?: R; fields: FieldName<R>[] }>
export type ThreadInput<R extends string> = Written<
  ThreadProps,
  { resource: R; filter?: Filter<R>; sender?: FieldName<R>; time: FieldName<R>; text: FieldName<R>; status?: FieldName<R>; working?: When }
>
export type ComposerInput<R extends string> = Written<ComposerProps, { resource: R; field: FieldName<R> }>
export type ActionInput<R extends string> = Written<ActionProps, { resource?: R }>
export type SettingsInput<R extends string> = Written<SettingsProps, { resource: R; fields?: FieldName<R>[] }>

/** A list's records, filtered and sorted as a data block's are: the object forms react-admin writes are not taken. */
type List<R extends string> = { filter?: Filter<R>; sort?: Sort<R>[]; empty?: Text }

export type ReferenceManyFieldInput<R extends string> = Written<ReferenceManyFieldProps, List<R> & { reference: R; target: FieldName<R> }>
export type ReferenceArrayFieldInput<R extends string> = Written<ReferenceArrayFieldProps, List<R> & { reference: R }>
export type ArrayFieldInput = Written<ArrayFieldProps, {}>
export type ReferenceFieldInput<R extends string> = Written<ReferenceFieldProps, { reference: R; empty?: Text; children?: RecordChildren<R> }>
/** Its children once per record of the list around it; give the list's resource, `<RecordsIterator<'tasks'>>`, to type a child function's record. */
export type RecordsIteratorInput<R extends string> = { children?: RecordChildren<R> } & Styled
