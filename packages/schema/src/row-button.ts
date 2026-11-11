import { addressErrors, type AddressCheck } from './address-errors'
import { addressPlaceholders, textPlaceholders } from './address-template'
import type { ResourceModel, RowButtonModel } from './model'

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** The fields of the row a button's label and address read. */
export const rowButtonFields = (button: RowButtonModel) => [...new Set([...textPlaceholders(button.label), ...addressPlaceholders(button.to)])]

/**
 * What is wrong with a row button on the rows of `source`: a missing label or address, a `{field}` the rows do not have,
 * or an address that cannot be followed, against `check`'s models. Empty when every row can show it.
 */
export const rowButtonErrors = (button: unknown, source: ResourceModel, check: Omit<AddressCheck, 'source'>): string[] => {
  if (!isObject(button)) return ["a row button is { label, to }, such as { label: 'Open', to: { kind: 'record', resource: 'tasks', key: '{id}' } }"]
  if (typeof button.label !== 'string' || button.label.trim() === '') return ['a row button needs a label']
  if (!isObject(button.to) || typeof button.to.kind !== 'string') return ["a row button needs an address in `to`, such as { kind: 'record', resource: 'tasks', key: '{id}' }"]
  const valid = button as RowButtonModel
  const label = textPlaceholders(valid.label).flatMap((name) => (Object.hasOwn(source.fields, name) ? [] : [`label: "{${name}}" is not a field of ${source.name}`]))
  return [...label, ...addressErrors(valid.to, { ...check, source }).map((error) => `to: ${error}`)]
}
