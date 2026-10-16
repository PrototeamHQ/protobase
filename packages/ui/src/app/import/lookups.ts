import type { Client } from '@protobase/client'
import { createWhere, printFilter, type ResourceModel } from '@protobase/schema'

const where = createWhere()
// Values per request, so the filter stays short
const valuesPerRequest = 100

/** The keys of the records whose field holds each value: none, one, or several when the value singles out no record. */
export type Found = Map<string, unknown[]>

/** A value as the lookups compare it: the API answers numbers as numbers and the rest as text. */
export const lookupKey = (value: unknown) => String(value)

/**
 * Finds records by the value of a field, for the relations of an import's rows and the records it updates: each value
 * is asked for once per import, a hundred at a time, and remembered.
 */
export const createLookups = (clientFor: (resource: string) => Client) => {
  const known = new Map<string, Found>()

  const foundOf = (resource: string, field: string) => {
    const id = `${resource}.${field}`
    if (!known.has(id)) known.set(id, new Map())
    return known.get(id)!
  }

  /** Asks the API for the values not asked for yet; the user reads only the records they may list. */
  const load = async (model: ResourceModel, field: string, values: unknown[]) => {
    const found = foundOf(model.name, field)
    const missing = [...new Map(values.filter((value) => !found.has(lookupKey(value))).map((value) => [lookupKey(value), value])).values()]
    const key = model.primaryKey[0]!
    for (let at = 0; at < missing.length; at += valuesPerRequest) {
      const asked = missing.slice(at, at + valuesPerRequest)
      for (const value of asked) found.set(lookupKey(value), [])
      const filter = printFilter(where.in(field, asked as never[]))
      let pageToken: string | undefined
      do {
        const page = await clientFor(model.name).list(model.name, { filter, fields: [...new Set([key, field])], pageSize: 1000, pageToken })
        for (const record of page.items as Record<string, unknown>[]) found.get(lookupKey(record[field]))?.push(record[key])
        pageToken = page.nextPageToken || undefined
      } while (pageToken)
    }
  }

  /** The keys of the records found by the value, once `load` asked for it. */
  const keysOf = (resource: string, field: string, value: unknown) => foundOf(resource, field).get(lookupKey(value)) ?? []

  return { load, keysOf }
}

export type Lookups = ReturnType<typeof createLookups>
