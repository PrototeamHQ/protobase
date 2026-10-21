import type { FieldModel, ResourceModel } from '@protobase/schema'
import { writeOnlyFields, type RequestAccess } from './request-access'

// A write-only field as the app gets it: sensitive, so nothing keeps or lists a value of it, and named by no filter or
// sort, since the caller cannot read it.
const writeOnly = (field: FieldModel): FieldModel => ({ ...field, readOnly: false, filterable: false, sortable: false, aliases: [], sensitive: true, writeOnly: true })

/** The resource as `/meta` sends it to the caller: the fields they read, and their write-only ones marked `writeOnly`. */
export const metaModel = (access: RequestAccess): ResourceModel => {
  const names = new Set(writeOnlyFields(access))
  if (names.size === 0) return access.readable
  const fields = Object.entries(access.full.fields).flatMap(([name, field]): Array<[string, FieldModel]> => {
    if (names.has(name)) return [[name, writeOnly(field)]]
    const readable = access.readable.fields[name]
    return readable ? [[name, readable]] : []
  })
  return { ...access.readable, fields: Object.fromEntries(fields) }
}
