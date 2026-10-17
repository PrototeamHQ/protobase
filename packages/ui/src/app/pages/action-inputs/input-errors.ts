import { isApiError } from '@protobase/client'
import type { ActionInputModel } from '@protobase/schema'

/**
 * What a handler throws to refuse answers, each message under the input it is about, such as
 * `throw new ActionInputError({ email: 'No user has this address' })`: the dialog stays open and shows each under its input.
 */
export class ActionInputError extends Error {
  constructor(readonly errors: Readonly<Record<string, string>>) {
    super(Object.values(errors).join('; '))
    this.name = 'ActionInputError'
  }
}

/**
 * The messages of a failed action about its inputs, by input name: an `ActionInputError`'s, or those of an API error
 * whose field is an input's name, as a function the handler invokes reports them. Empty when none is about an input.
 */
export const inputErrors = (error: unknown, inputs: ActionInputModel[]): Record<string, string> => {
  const names = new Set(inputs.map((input) => input.name))
  const entries = error instanceof ActionInputError ? Object.entries(error.errors) : isApiError(error) ? error.errors.flatMap((entry) => (entry.field ? [[entry.field, entry.message] as const] : [])) : []
  return Object.fromEntries(entries.filter(([name]) => names.has(name)))
}
