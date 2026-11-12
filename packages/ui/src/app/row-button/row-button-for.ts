import type { AppAddress, ResourceModel, RowButtonModel, ViewModel } from '@protobase/schema'
import { bareFilterFields, fillAddress, fillText, hrefField, rowButtonChoiceFields, rowButtonChoices } from '@protobase/schema/internal'
import { displayValue } from '../../live/display-value'

const isEmpty = (value: unknown) => value === null || value === undefined || value === ''

// Only an https page opens from a row, so a field holding another scheme, such as `javascript:`, leads nowhere.
const httpsUrl = (value: unknown) => (typeof value === 'string' && URL.canParse(value) && new URL(value).protocol === 'https:' ? new URL(value).href : undefined)

// A value a filter takes outside quotes is a number or a boolean, so a row's text cannot change what the filter says.
const plainValue = (value: unknown) => typeof value === 'number' || typeof value === 'boolean' || (typeof value === 'string' && /^(-?\d+(\.\d+)?|true|false)$/.test(value))

/**
 * The button `button` draws on `record`, a row of `model`: its first choice whose fields the row holds, its label with
 * each `{field}` as the record page shows the value (an enum value by its label), and its address filled from the row,
 * or the `https:` URL its href field holds. None when no choice has its fields, or the chosen one leads nowhere: an
 * href field without an `https:` URL, or a value outside quotes in a filter that is not a number or a boolean.
 */
export const rowButtonFor = (button: RowButtonModel, model: ResourceModel, view: ViewModel | undefined, record: Record<string, unknown>): { label: string; to: AppAddress } | { label: string; href: string } | undefined => {
  const choice = rowButtonChoices(button).find((option) => !rowButtonChoiceFields(option).some((name) => isEmpty(record[name])))
  if (!choice) return
  const shown = (name: string) => {
    const field = model.fields[name]
    return field ? displayValue(field, record[name], view?.fields[name]) : String(record[name])
  }
  const label = fillText(choice.label, shown)
  if ('href' in choice) {
    const href = httpsUrl(record[hrefField(choice.href) ?? ''])
    return href === undefined ? undefined : { label, href }
  }
  if (!bareFilterFields(choice.to).every((name) => plainValue(record[name]))) return
  return { label, to: fillAddress(choice.to, record) }
}
