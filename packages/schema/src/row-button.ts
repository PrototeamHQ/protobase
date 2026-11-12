import { addressErrors, type AddressCheck } from './address-errors'
import { addressPlaceholders, hrefField, textPlaceholders } from './address-template'
import type { AppAddress, ResourceModel, RowButtonChoice, RowButtonModel } from './model'

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const shape = "a row button is { label, to } or { label, href }, such as { label: 'Open', to: { kind: 'record', resource: 'tasks', key: '{id}' } } or { label: 'Report', href: '{report_url}' }, or a list of them"

/** A row button's choices, in order: the one it is, or each of its list. */
export const rowButtonChoices = (button: RowButtonModel): readonly RowButtonChoice[] => (Array.isArray(button) ? button : [button as RowButtonChoice])

/** The fields of the row a choice's label and address or href read; a row without a value for one of them skips it. */
export const rowButtonChoiceFields = (choice: RowButtonChoice) => [...new Set([...textPlaceholders(choice.label), ...('href' in choice ? textPlaceholders(choice.href) : addressPlaceholders(choice.to))])]

/** The fields of the row any of a button's choices reads, to load with the rows. */
export const rowButtonFields = (button: RowButtonModel) => [...new Set(rowButtonChoices(button).flatMap(rowButtonChoiceFields))]

const missing = (names: string[], source: ResourceModel, part: string) => names.flatMap((name) => (Object.hasOwn(source.fields, name) ? [] : [`${part}: "{${name}}" is not a field of ${source.name}`]))

const choiceErrors = (choice: unknown, source: ResourceModel, check: Omit<AddressCheck, 'source'>): string[] => {
  if (!isObject(choice)) return [shape]
  if (typeof choice.label !== 'string' || choice.label.trim() === '') return ['a row button needs a label']
  if (choice.to !== undefined && choice.href !== undefined) return ['a row button opens an address in `to` or an outside page in `href`, not both']
  const label = missing(textPlaceholders(choice.label), source, 'label')
  if (choice.href !== undefined) {
    const field = typeof choice.href === 'string' ? hrefField(choice.href) : undefined
    if (field === undefined) return [...label, "href: a row button's href is the one field that holds the page's https URL, such as '{report_url}'"]
    return [...label, ...missing([field], source, 'href')]
  }
  if (!isObject(choice.to) || typeof choice.to.kind !== 'string') return ["a row button needs an address in `to`, such as { kind: 'record', resource: 'tasks', key: '{id}' }, or an outside page in `href`"]
  return [...label, ...addressErrors(choice.to as AppAddress, { ...check, source }).map((error) => `to: ${error}`)]
}

/**
 * What is wrong with a row button on the rows of `source`: per choice, a missing label or target, both an address and an
 * href, an href that is not one `{field}`, a `{field}` the rows do not have, or an address that cannot be followed,
 * against `check`'s models; or a list without choices. Empty when every row can show it.
 */
export const rowButtonErrors = (button: unknown, source: ResourceModel, check: Omit<AddressCheck, 'source'>): string[] => {
  if (!Array.isArray(button)) return choiceErrors(button, source, check)
  if (button.length === 0) return ['a row button list needs at least one choice']
  return button.flatMap((choice, index) => choiceErrors(choice, source, check).map((error) => `choice ${index + 1}: ${error}`))
}

/**
 * `button` with only the choices a caller can follow against `check`'s restricted models, in order, so their rows fall
 * through to the next; none when no choice is left.
 */
export const followableRowButton = (button: RowButtonModel, source: ResourceModel, check: Omit<AddressCheck, 'source'>): RowButtonModel | undefined => {
  if (!Array.isArray(button)) return rowButtonErrors(button, source, check).length === 0 ? button : undefined
  const kept = rowButtonChoices(button).filter((choice) => choiceErrors(choice, source, check).length === 0)
  return kept.length === 0 ? undefined : kept
}
