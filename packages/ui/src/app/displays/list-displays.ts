import type { FieldModel, FieldViewModel, ListDisplayModel, ResourceModel, ViewModel } from '@protobase/schema'
import { encodeKey, tableDisplay } from '@protobase/schema/internal'
import { listColumnNames } from '../../live/columns-from-model'
import { displayValue } from '../../live/display-value'
import { recordKey, recordTitleField } from '../../live/model-helpers'
import { humanize } from '../../live/naming'
import { photosKey } from '../../live/row-photos'
import { filledFields } from '../filled-fields'
import { boardCard } from './board-columns'
import { text } from './messages'

/** A row as a list display gets it: its key, the record as the list API gives it, and names of the records its relations point at. */
export type ListDisplayRow = {
  /** The record's key, in the text form the record API takes. */
  key: string
  record: Record<string, unknown>
  /** The name of the record a relation field points at, for the relations the list shows. */
  labels: Record<string, string>
  /** The files of its first photos, when the list loaded the photos its cards display names. */
  photos?: unknown[]
}

/** What a card component of a cards display (`d.cards(..., { card })`) gets: the record it draws, of the display's fields. */
export type RecordCardProps = { row: ListDisplayRow }

/** One choice of the list's display switch: the table first, then the view's displays. */
export type DisplayChoice = { name: string; label: string; icon?: string }

type CardsDisplayModel = Extract<ListDisplayModel, { kind: 'cards' }>

export const displaysOf = (view: ViewModel | undefined): ListDisplayModel[] => view?.list?.displays ?? []

/**
 * The display a list opens in when its address names none. Below the `sm` breakpoint a list with a cards display opens
 * in one: `preferred` or the view's default when that is a cards display, else the first. Otherwise `preferred`, the
 * view's default, or the table.
 */
export const defaultDisplay = (view: ViewModel | undefined, xs: boolean, preferred?: string): string => {
  const fallback = preferred ?? view?.list?.default ?? tableDisplay
  if (!xs) return fallback
  const cards = displaysOf(view).filter((display) => display.kind === 'cards')
  return cards.find((display) => display.name === fallback)?.name ?? cards[0]?.name ?? fallback
}

/** The name of the list a phone shows for a list without a cards display. */
export const rowsDisplay = 'rows'

/**
 * The list a phone shows for a list without a cards display, as a cards display of a row per record: the title, the
 * first enum column as a badge on the right, and the next two columns, booleans left out, on a muted line below.
 * `undefined` for a view with a cards display, or a display of its own named `rows`.
 */
export const phoneRows = (model: ResourceModel, view: ViewModel | undefined): CardsDisplayModel | undefined => {
  if (displaysOf(view).some((display) => display.kind === 'cards' || display.name === rowsDisplay)) return undefined
  const title = recordTitleField(model, view)
  const candidates = listColumnNames(model, view).filter((name) => name !== title && model.fields[name] !== undefined)
  const badge = candidates.find((name) => model.fields[name]!.type === 'enum')
  const footer = candidates.filter((name) => name !== badge && model.fields[name]!.type !== 'boolean').slice(0, 2)
  return { kind: 'cards', name: rowsDisplay, label: text('list'), icon: 'list', title, ...(badge !== undefined && { badge }), footer }
}

const isPhoneRows = (view: ViewModel | undefined, display: ListDisplayModel) => display.name === rowsDisplay && !displaysOf(view).some((other) => other.name === rowsDisplay)

/**
 * The display a list page opens in when its address names none: `defaultDisplay`, but below the `sm` breakpoint the
 * phone's rows (`phoneRows`) in place of the table.
 */
export const listDefaultDisplay = (model: ResourceModel, view: ViewModel | undefined, xs: boolean) => {
  const display = defaultDisplay(view, xs)
  return xs && display === tableDisplay && phoneRows(model, view) ? rowsDisplay : display
}

/** The display a list page shows for the address's `name`: `shownDisplay`, or the phone's rows when it names them, on any screen. */
export const shownListDisplay = (model: ResourceModel, view: ViewModel | undefined, name: string): ListDisplayModel | undefined =>
  (name === rowsDisplay ? phoneRows(model, view) : undefined) ?? shownDisplay(view, name)

/** The display a list shows for the address's `name`: `undefined` for the table, and the view's default for a name it does not have. */
export const shownDisplay = (view: ViewModel | undefined, name: string): ListDisplayModel | undefined => {
  if (name === tableDisplay) return undefined
  const named = (wanted: string | undefined) => displaysOf(view).find((display) => display.name === wanted)
  return named(name) ?? named(view?.list?.default)
}

const defaultIcons: Partial<Record<ListDisplayModel['kind'], string>> = { cards: 'cards', map: 'map', board: 'kanban', calendar: 'calendar', timeline: 'timeline' }

export const displayChoices = (view: ViewModel | undefined): DisplayChoice[] => [
  { name: tableDisplay, label: text('table'), icon: 'table' },
  ...displaysOf(view).map((display) => ({ name: display.name, label: display.label ?? humanize(display.name), icon: display.icon ?? defaultIcons[display.kind] })),
]

/** The list page's display switch: `displayChoices`, and below the `sm` breakpoint the phone's rows when it has them. */
export const listDisplayChoices = (model: ResourceModel, view: ViewModel | undefined, xs: boolean): DisplayChoice[] => {
  const choices = displayChoices(view)
  return xs && phoneRows(model, view) ? [...choices, { name: rowsDisplay, label: text('list'), icon: 'list' }] : choices
}

/** The fields a cards display shows, its title the view's title field when it names none. */
export const cardFields = (model: ResourceModel, view: ViewModel | undefined, display: CardsDisplayModel) => ({
  image: display.image,
  title: display.title ?? recordTitleField(model, view),
  subtitle: display.subtitle,
  amount: display.amount ?? [],
  badge: display.badge,
  meta: display.meta ?? [],
  footer: display.footer ?? [],
  flags: display.flags ?? [],
})

/** The meta fields a card shows for a row: those with a value, so a listing for rent only shows no purchase price. */
export const filledMeta = (row: ListDisplayRow, meta: string[]) => filledFields(row.record, meta)

/** The amount field a card shows for a row: the first with a value, so a listing for rent only shows its rent. */
export const filledAmount = (row: ListDisplayRow, amount: string[]): string | undefined => filledMeta(row, amount)[0]

/** A card's amount split for drawing: the number with its prefix, such as `€1,450`, apart from its suffix, such as ` /month`. */
export const amountParts = (field: FieldModel, value: unknown, hints: FieldViewModel = {}): { amount: string; suffix?: string } => {
  const { suffix, ...unsuffixed } = hints
  const numeric = field.type === 'decimal' || field.type === 'integer' || field.type === 'bigint'
  if (!numeric || suffix === undefined || hints.format === 'percent') return { amount: displayValue(field, value, hints) }
  return { amount: displayValue(field, value, unsuffixed), suffix }
}

/** The cards display whose card a map shows for a record: the one it names, else the list's first, else the title alone. */
export const mapCards = (view: ViewModel | undefined, display: Extract<ListDisplayModel, { kind: 'map' }>): CardsDisplayModel => {
  const cards = displaysOf(view).filter((other): other is CardsDisplayModel => other.kind === 'cards')
  const named = display.cards === undefined ? cards[0] : cards.find((other) => other.name === display.cards)
  return named ?? { kind: 'cards', name: display.name }
}

/** Every field a display shows, the fields its rows are loaded and labelled for. */
export const shownFields = (model: ResourceModel, view: ViewModel | undefined, display: ListDisplayModel): string[] => {
  if (display.kind === 'custom') return display.fields
  if (display.kind === 'map') return [display.latitude, display.longitude, ...shownFields(model, view, mapCards(view, display))]
  if (display.kind === 'board') {
    const card = boardCard(model, view, display)
    return [display.by, card.title, card.subtitle, card.badge, ...(card.meta ?? [])].filter((name): name is string => name !== undefined)
  }
  if (display.kind === 'calendar') return [display.start, display.end, display.title ?? recordTitleField(model, view)].filter((name): name is string => name !== undefined)
  if (display.kind === 'timeline') return [display.start, display.end, display.group, display.title ?? recordTitleField(model, view)].filter((name): name is string => name !== undefined)
  const { image, title, subtitle, amount, badge, meta, footer, flags } = cardFields(model, view, display)
  return [image, title, subtitle, ...amount, badge, ...meta, ...footer, ...flags].filter((name): name is string => name !== undefined)
}

/** The fields to label the list's rows for: the table's columns and every display's, so one load serves them all. */
export const loadedFields = (model: ResourceModel, view: ViewModel | undefined, columns: string[]) => {
  const rows = phoneRows(model, view)
  const displays = rows ? [...displaysOf(view), rows] : displaysOf(view)
  return [...new Set([...columns, ...displays.flatMap((display) => shownFields(model, view, display))])]
}

/**
 * The sortable fields a display shows, for the sort menu that stands in for column headers; for the phone's rows, those
 * of the table's columns and the title, as the table's headers sort by.
 */
export const sortFields = (model: ResourceModel, view: ViewModel | undefined, display: ListDisplayModel) => {
  const shown = isPhoneRows(view, display) ? [recordTitleField(model, view), ...listColumnNames(model, view)] : shownFields(model, view, display)
  return [...new Set(shown)].filter((name) => model.fields[name]?.sortable)
}

const isLabelled = (value: unknown): value is { id: unknown; name: string } => typeof value === 'object' && value !== null && 'id' in value && 'name' in value

/**
 * A loaded row, its relations as `{ id, name }`, split into the record as the API gives it, the relations' names and
 * the photos it was loaded with.
 */
export const displayRow = (model: ResourceModel, row: Record<string, unknown>): ListDisplayRow => {
  const record: Record<string, unknown> = {}
  const labels: Record<string, string> = {}
  const photos = Array.isArray(row[photosKey]) ? (row[photosKey] as unknown[]) : undefined
  for (const [name, value] of Object.entries(row)) {
    if ((name === 'id' || name === photosKey) && !Object.hasOwn(model.fields, name)) continue
    if (model.fields[name]?.type === 'relation' && isLabelled(value)) {
      record[name] = value.id
      labels[name] = value.name
    } else {
      record[name] = value
    }
  }
  return { key: encodeKey(recordKey(model, record)), record, labels, ...(photos && { photos }) }
}
