import { badRequest } from './problem'
import { writableFields, type RequestAccess } from './request-access'
import type { Row } from './types'

export type FieldError = { field: string; code: 'unknown-field' | 'read-only' | 'required' | 'invalid-value' | 'invalid-record'; message: string }

const fail = (errors: FieldError[]) =>
  badRequest('invalid-record', `The request body is invalid: ${errors[0]!.field}: ${errors[0]!.message}`, { errors })

const isObject = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value)

const reserved = ['etag', 'permissions']

/**
 * Checks a create or update body for this caller. A field the caller cannot read is an unknown field, one they can read
 * but not write is read-only (the tenant column and the API's own `etag` and `permissions` keys are always read-only);
 * every provided value goes through its field's zod schema, then `.validate()` rules run on the result.
 * Returns only the values to write: on create the defaults are filled in, on update only the provided fields.
 * `current` is the stored record an update merges into for `.validate()` rules.
 */
export const validateBody = (access: RequestAccess, mode: 'create' | 'update', body: unknown, current: Row = {}) => {
  if (!isObject(body)) throw badRequest('invalid-record', 'The request body must be a JSON object')
  const { entry, readable: model, full } = access
  const writable = new Set(writableFields(access, mode))
  const errors: FieldError[] = []
  const values: Row = {}

  for (const name of Object.keys(body)) {
    if (reserved.includes(name) && !Object.hasOwn(model.fields, name)) {
      errors.push({ field: name, code: 'read-only', message: name === 'etag' ? 'The version is not part of the body; send it in the If-Match header' : `"${name}" is read-only` })
    } else if (!Object.hasOwn(model.fields, name)) errors.push({ field: name, code: 'unknown-field', message: `Unknown field "${name}"` })
    else if (!writable.has(name) || name === full.tenant) errors.push({ field: name, code: 'read-only', message: `"${name}" is read-only` })
  }
  if (errors.length > 0) throw fail(errors)

  for (const [name, source] of Object.entries(entry.source.state.fields ?? {})) {
    const field = full.fields[name]
    if (!source || !field || !writable.has(name) || name === full.tenant) continue
    const provided = Object.hasOwn(body, name)
    if (!provided && mode === 'update') continue
    if (!provided && field.default && 'db' in field.default) continue
    const parsed = source.schema.safeParse(provided ? body[name] : undefined)
    if (parsed.success) {
      if (parsed.data !== undefined) values[name] = parsed.data
      continue
    }
    if (!provided && field.nullable) continue
    if (!provided) errors.push({ field: name, code: 'required', message: `"${name}" is required` })
    else errors.push(...parsed.error.issues.map((issue): FieldError => ({ field: name, code: 'invalid-value', message: issue.message })))
  }
  if (errors.length > 0) throw fail(errors)

  const merged = { ...current, ...values }
  const issues = entry.source.validators.flatMap((validate) => validate(merged) ?? [])
  if (issues.length > 0) throw fail(issues.map((issue): FieldError => ({ field: Object.hasOwn(model.fields, issue.field) ? issue.field : '_record', code: 'invalid-record', message: issue.message })))
  return values
}
