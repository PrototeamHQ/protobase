import type { ResourceModel } from '@protobase/schema'
import type { Row } from './types'

const exposeValue = (type: string, value: unknown) => {
  if (typeof value === 'bigint') return value.toString()
  if (!(value instanceof Date)) return value
  const iso = value.toISOString()
  return type === 'date' ? iso.slice(0, 10) : iso
}

/** A row as the API shows it: dates as ISO text, 64-bit integers as strings. */
export const exposeRow = (model: ResourceModel, row: Row): Row =>
  Object.fromEntries(
    Object.entries(row)
      .filter(([name]) => Object.hasOwn(model.fields, name))
      .map(([name, value]) => [name, exposeValue(model.fields[name]!.type, value)]),
  )

export const pickFields = (row: Row, names?: string[]): Row =>
  names ? Object.fromEntries(names.map((name) => [name, row[name]])) : row
