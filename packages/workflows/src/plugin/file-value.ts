import type { FileValue } from './context'

/** Whether a value has a file value's shape, all four fields; an object with only a `uri` is other data. */
export const isFileValue = (value: unknown): value is FileValue => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const { uri, name, type, size } = value as Partial<Record<keyof FileValue, unknown>>
  return typeof uri === 'string' && typeof name === 'string' && typeof type === 'string' && typeof size === 'number'
}
