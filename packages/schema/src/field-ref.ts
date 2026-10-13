import type { JsonValue } from './model'
import { isRef } from './refs'

/**
 * A field named inside free-form data, such as a custom component's props: `{ $field: 'status' }`, or a path through
 * relations (`plan.name`) on a page. Marked, so that the walker leaving out hidden fields finds it wherever it is.
 */
export type FieldRefValue = {
  /** The field's name, or a path through relations. */
  readonly $field: string
}

/** A field reference for a layout's custom component props, such as `<UsageChart field={fieldRef('total')} />`. */
export const fieldRef = (path: string): FieldRefValue => ({ $field: path })

export const isFieldRef = (value: unknown): value is FieldRefValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length === 1 && typeof (value as FieldRefValue).$field === 'string'

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** Props as a view stores them: every `r.field` in them, at any depth, becomes a field reference. */
export const markFieldRefs = (value: unknown): JsonValue => {
  if (isRef(value)) return fieldRef(value.name)
  if (Array.isArray(value)) return value.map(markFieldRefs)
  if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([name, entry]) => [name, markFieldRefs(entry)]))
  return value as JsonValue
}

/** Props as a custom component gets them: every field reference as its field's name. */
export const unmarkFieldRefs = <T>(value: T): T => {
  if (isFieldRef(value)) return value.$field as T
  if (Array.isArray(value)) return value.map(unmarkFieldRefs) as T
  if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([name, entry]) => [name, unmarkFieldRefs(entry)])) as T
  return value
}

/** Every field the value names through field references, at any depth. */
export const fieldRefsIn = (value: unknown): string[] => {
  if (isFieldRef(value)) return [value.$field]
  if (Array.isArray(value)) return value.flatMap(fieldRefsIn)
  if (isObject(value)) return Object.values(value).flatMap(fieldRefsIn)
  return []
}
