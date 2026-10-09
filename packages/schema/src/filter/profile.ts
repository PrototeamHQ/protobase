import type { FunctionSpec, Schema, ValueType } from 'aip-parsers/filter'
import type { FieldModel, ResourceModel } from '../model'

/** Protobase's filter functions, declared through the library's registry. */
export const functions: Record<string, FunctionSpec> = {
  in: { params: [{ name: 'field', type: 'field' }], rest: { name: 'value', type: 'any' } },
  search: { params: [{ name: 'text', type: 'string' }] },
  similar: { params: [{ name: 'field', type: 'field', of: ['string'] }, { name: 'text', type: 'string' }] },
  regex: { params: [{ name: 'field', type: 'field', of: ['string'] }, { name: 'pattern', type: 'string' }] },
  isNull: { params: [{ name: 'field', type: 'field' }] },
  now: { params: [], returns: 'timestamp' },
}

export const parseOptions = { extensions: { arithmetic: 'now-offset' as const, durationUnits: true } }

// Types whose value formats the library has no notion of (decimal, uuid, ...) map to `any`;
// checkAgainstModel validates them.
export const libraryType = (field: FieldModel): ValueType => {
  switch (field.type) {
    case 'text':
      return 'string'
    case 'integer':
    case 'bigint':
      return 'integer'
    case 'boolean':
    case 'timestamp':
    case 'enum':
      return field.type
    default:
      return 'any'
  }
}

export const schemaOf = (model: ResourceModel): Schema => ({
  fields: Object.fromEntries(
    Object.values(model.fields).map((field) => [
      field.name,
      {
        type: libraryType(field),
        filterable: field.filterable,
        sortable: field.sortable,
        aliases: field.aliases,
        ...(field.enumValues && { values: field.enumValues }),
      },
    ]),
  ),
  functions,
})
