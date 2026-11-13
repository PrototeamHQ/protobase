import { appPath, type AppAddress } from '@protobase/schema'
import { fillAddress } from '@protobase/schema/internal'
import type { TextOptions } from './text-form'

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** The value at `path` in the record: a key named `plan.name` as it is, else `plan` and then its `name`. */
export const recordValue = (record: Record<string, unknown>, path: string): unknown => {
  if (Object.hasOwn(record, path)) return record[path]
  let value: unknown = record
  for (const part of path.split('.')) {
    if (!isObject(value) || !Object.hasOwn(value, part)) return
    value = value[part]
  }
  return value
}

/** The path of an address, its `{field}`s filled from the record when there is one, and left as written when not. */
export const addressHref = (to: AppAddress, options: TextOptions) => appPath(options.record ? fillAddress(to, options.record) : to, options.basePath)
