import type { AppAddress, ResourceModel, RowButtonModel, ViewModel } from '@protobase/schema'
import { fillAddress, fillText, rowButtonFields } from '@protobase/schema/internal'
import { displayValue } from '../../live/display-value'

const isEmpty = (value: unknown) => value === null || value === undefined || value === ''

/**
 * The button `button` draws on `record`, a row of `model`: its label with each `{field}` as the record page shows the
 * value (an enum value by its label), and its address filled from the row. None when the row has no value for a field
 * it names, as an address without it leads nowhere.
 */
export const rowButtonFor = (button: RowButtonModel, model: ResourceModel, view: ViewModel | undefined, record: Record<string, unknown>): { label: string; to: AppAddress } | undefined => {
  if (rowButtonFields(button).some((name) => isEmpty(record[name]))) return
  const shown = (name: string) => {
    const field = model.fields[name]
    return field ? displayValue(field, record[name], view?.fields[name]) : String(record[name])
  }
  return { label: fillText(button.label, shown), to: fillAddress(button.to, record) }
}
