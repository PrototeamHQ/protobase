import { isDatabaseError } from './error-handler'
import { badRequest } from './problem'
import type { Registry } from './registry'

// SQLSTATE 23514: a CHECK constraint, or a trigger raising check_violation, refused the write
const checkViolation = '23514'

// The constraint a check violation names; from the driver's own error when a wrapper keeps it as the cause
const constraintOf = (error: unknown): string | undefined => {
  if (!isDatabaseError(error)) return undefined
  if (error.constraint !== undefined) return error.constraint
  const cause = (error as { cause?: unknown }).cause
  return isDatabaseError(cause) ? cause.constraint : undefined
}

/**
 * The 400 of a write a check the config declares refused (`.checks()`): `invalid-record` whose one error names the check
 * as its `code`, with its label as the message, built from the config alone, never from the database's message, detail
 * or hint. Any other error is undefined; a check violation naming a check no resource declares is logged by its name,
 * and keeps the generic 400 of the error handler.
 */
export const declaredCheckProblem = (registry: Registry, error: unknown) => {
  if (!isDatabaseError(error) || error.code !== checkViolation) return undefined
  const name = constraintOf(error)
  if (name === undefined) return undefined
  const check = registry.entries.find((entry) => Object.hasOwn(entry.model.checks ?? {}, name))?.model.checks?.[name]
  if (!check) {
    console.warn(`A database check the config does not declare refused a write: ${name}`)
    return undefined
  }
  return badRequest('invalid-record', `The database check ${name} refused the record`, { errors: [{ field: '_record', code: name, message: check.label }] })
}

/** `run`, with a write a declared check refused thrown as its 400 (see `declaredCheckProblem`). */
export const withDeclaredChecks = async <T>(registry: Registry, run: () => Promise<T>): Promise<T> => {
  try {
    return await run()
  } catch (error) {
    throw declaredCheckProblem(registry, error) ?? error
  }
}
