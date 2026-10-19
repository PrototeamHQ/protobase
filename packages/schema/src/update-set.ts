import { hrefField } from './address-template'
import type { ActionInputModel } from './model'

/** Why an update's `set` cannot be used: a value that is exactly `{name}` must name one of the inputs the action asks for. */
export const updateSetErrors = (set: Record<string, unknown>, inputs: ActionInputModel[] = []) =>
  Object.entries(set).flatMap(([field, value]) => {
    const input = typeof value === 'string' ? hrefField(value) : undefined
    if (input === undefined || inputs.some((entry) => entry.name === input)) return []
    return [`set "${field}" names input "${input}", which it does not ask for`]
  })

/**
 * The fields an update writes: a literal as it is, a value that is exactly `{input}` as that input's answer. A field whose
 * input was hidden has no answer in `values` and is left out, so it keeps what it holds.
 */
export const updateValues = (set: Record<string, unknown>, values: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(set).flatMap(([field, value]): Array<[string, unknown]> => {
      const input = typeof value === 'string' ? hrefField(value) : undefined
      if (input === undefined) return [[field, value]]
      return Object.hasOwn(values, input) ? [[field, values[input]]] : []
    }),
  )
