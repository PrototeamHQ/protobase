import { hrefField } from './address-template'
import type { ActionInputModel } from './model'

/**
 * Why an update's `set` cannot be used: a value that is exactly `{{name}}` must name one of the inputs the action asks
 * for, and never a secret, which the update would store and send back.
 */
export const updateSetErrors = (set: Record<string, unknown>, inputs: ActionInputModel[] = []) =>
  Object.entries(set).flatMap(([field, value]) => {
    const input = typeof value === 'string' ? hrefField(value) : undefined
    if (input === undefined) return []
    const entry = inputs.find((candidate) => candidate.name === input)
    if (!entry) return [`set "${field}" names input "${input}", which it does not ask for`]
    return entry.kind === 'secret' ? [`set "${field}" names secret input "${input}", which an update never writes; take it in an action's handler`] : []
  })

/**
 * The fields an update writes: a literal as it is, a value that is exactly `{{input}}` as that input's answer. A field whose
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
