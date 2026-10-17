import type { FieldModel, FieldViewModel, ListDisplayModel, ResourceModel, ViewModel } from '@protobase/schema'
import { encodeKey, tableDisplay } from '@protobase/schema/internal'
import { displayValue } from '../../live/display-value'
import { recordKey, recordTitleField } from '../../live/model-helpers'
import { humanize } from '../../live/naming'
import { photosKey } from '../../live/row-photos'
import { filledFields } from '../filled-fields'
import { boardCard } from './board-columns'

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

/** The display a list shows for the address's `name`: `undefined` for the table, and the view's default for a name it does not have. */
export const shownDisplay = (view: ViewModel | undefined, name: string): ListDisplayModel | undefined => {
  if (name === tableDisplay) return undefined
  const named = (wanted: string | undefined) => displaysOf(view).find((display) => display.name === wanted)
  return named(name) ?? named(view?.list?.default)
}

const defaultIcons: Partial<Record<ListDisplayModel['kind'], string>> = { cards: 'cards', map: 'map', board: 'kanban' }

export const displayChoices = (view: ViewModel | undefined): DisplayChoice[] => [
  { name: tableDisplay, label: 'Table', icon: 'table' },
  ...displaysOf(view).map((display) => ({ name: display.name, label: display.label ?? humanize(display.name), icon: display.icon ?? defaultIcons[display.kind] })),
]

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
  const { image, title, subtitle, amount, badge, meta, footer, flags } = cardFields(model, view, display)
  return [image, title, subtitle, ...amount, badge, ...meta, ...footer, ...flags].filter((name): name is string => name !== undefined)
}

/** The fields to label the list's rows for: the table's columns and every display's, so one load serves them all. */
export const loadedFields = (model: ResourceModel, view: ViewModel | undefined, columns: string[]) => [
  ...new Set([...columns, ...displaysOf(view).flatMap((display) => shownFields(model, view, display))]),
]

/** The sortable fields a display shows, for the sort menu that stands in for column headers. */
export const sortFields = (model: ResourceModel, view: ViewModel | undefined, display: ListDisplayModel) =>
  [...new Set(shownFields(model, view, display))].filter((name) => model.fields[name]?.sortable)

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
