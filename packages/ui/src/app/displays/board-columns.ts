import type { ListDisplayModel, ResourceModel, ViewModel } from '@protobase/schema'
import { enumLabel, printFilter, where } from '@protobase/schema'
import { isApiError } from '@protobase/client'
import { recordTitleField } from '../../live/model-helpers'
import { humanize } from '../../live/naming'

export type BoardDisplayModel = Extract<ListDisplayModel, { kind: 'board' }>
type CardsDisplayModel = Extract<ListDisplayModel, { kind: 'cards' }>

/** One column of a board: the value its records have, `null` for those without one, and its heading. */
export type BoardColumn = { value: string | null; label: string }

/**
 * A board's columns: one per value of its enum field, in the order the field lists them, headed by the view's value
 * label; then, when the field may be empty, one for the records without a value.
 */
export const boardColumns = (model: ResourceModel, view: ViewModel | undefined, display: BoardDisplayModel): BoardColumn[] => {
  const field = model.fields[display.by]
  if (!field) return []
  const hints = view?.fields[display.by]
  const values = (field.enumValues ?? []).map((value) => ({ value, label: enumLabel(value, hints?.valueLabels) }))
  if (!field.nullable) return values
  return [...values, { value: null, label: `No ${(hints?.label ?? humanize(display.by)).toLowerCase()}` }]
}

/** The list's filter, its search included, narrowed to the records of one column. */
export const columnFilter = (filter: string, by: string, value: string | null) => {
  const column = printFilter(value === null ? where.isNull(by) : where.eq(by, value))
  return filter === '' ? column : `(${filter}) AND ${column}`
}

/** The built-in card a board draws for each record: that of a cards display of the board's fields. */
export const boardCard = (model: ResourceModel, view: ViewModel | undefined, display: BoardDisplayModel): CardsDisplayModel => ({
  kind: 'cards',
  name: display.name,
  title: display.title ?? recordTitleField(model, view),
  ...(display.subtitle !== undefined && { subtitle: display.subtitle }),
  ...(display.badge !== undefined && { badge: display.badge }),
  ...(display.meta && { meta: display.meta }),
})

/** Why the server refused a move: the reasons it gives per field, such as a `validate` message, else its detail. */
export const refusalReason = (error: unknown) => {
  if (!isApiError(error)) return error instanceof Error ? error.message : 'Something went wrong'
  const reasons = error.errors.map((entry) => entry.message)
  return reasons.length > 0 ? reasons.join('; ') : error.message
}
