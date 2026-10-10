import { z } from 'zod'
import type { Entry } from '../registry'
import { writableFields, type RequestAccess } from '../request-access'
import { pascal } from './naming'

type JsonSchema = Record<string, any>

const convert = (entry: Entry, io: 'input' | 'output'): JsonSchema => {
  const schema = z.toJSONSchema(entry.source.recordSchema(), {
    io,
    unrepresentable: 'any',
    // Zod's format patterns are huge and the format says the same
    override: ({ jsonSchema }) => {
      if (jsonSchema.format) delete jsonSchema.pattern
    },
  })
  delete schema.$schema
  return schema
}

// Recursive definitions (json fields) move to components, named after the resource.
const hoist = (entry: Entry, schema: JsonSchema) => {
  const { $defs = {}, ...rest } = schema
  const rename = (key: string) => `${pascal(entry.name)}${key.replace(/^__/, '_')}`
  let text = JSON.stringify(rest)
  for (const key of Object.keys($defs)) text = text.replaceAll(`"#/$defs/${key}"`, `"#/components/schemas/${rename(key)}"`)
  const hoisted = Object.fromEntries(Object.entries($defs).map(([key, value]) => [rename(key), JSON.parse(JSON.stringify(value).replaceAll(`"#/$defs/${key}"`, `"#/components/schemas/${rename(key)}"`))]))
  return { schema: JSON.parse(text) as JsonSchema, hoisted }
}

/** How responses carry a file field. */
export const fileSchema: JsonSchema = {
  type: 'object',
  required: ['uri'],
  description: 'A stored file. `url` downloads it: a signed link valid one to two hours for private files, a permanent one for public files. A value that names no configured provider comes as `{ uri, missing: true }`.',
  properties: {
    uri: { type: 'string', description: 'The stored value, `{provider}:{path}?name=…&size=…`; send it back unchanged to keep the file' },
    name: { type: 'string' },
    type: { type: 'string', description: 'Detected from the content at upload' },
    size: { type: 'integer' },
    url: { type: 'string' },
    missing: { type: 'boolean' },
  },
}

const only = (schema: JsonSchema, names: string[]): JsonSchema => ({
  ...schema,
  properties: Object.fromEntries(names.filter((name) => schema.properties?.[name]).map((name) => [name, schema.properties[name]])),
  ...(schema.required && { required: (schema.required as string[]).filter((name) => names.includes(name)) }),
})

/**
 * Component schemas of a resource for one caller: the record with the fields they may read, and the create and update
 * bodies with the fields they may write. Hidden fields appear nowhere.
 */
export const resourceSchemas = (access: RequestAccess) => {
  const { entry, model, resolved } = access
  const name = pascal(entry.name)
  const readable = Object.keys(model.fields)
  const output = hoist(entry, convert(entry, 'output'))
  const input = hoist(entry, convert(entry, 'input'))
  const record = only(output.schema, readable)
  for (const field of Object.values(model.fields)) {
    if (field.file && record.properties?.[field.name]) record.properties[field.name] = field.nullable ? { anyOf: [{ $ref: '#/components/schemas/File' }, { type: 'null' }] } : { $ref: '#/components/schemas/File' }
    if (field.readOnly && record.properties?.[field.name]) record.properties[field.name].readOnly = true
  }
  record.properties.etag = { type: 'string', readOnly: true, description: 'The record version, as in the ETag header; send it in If-Match when updating or deleting' }
  record.properties.permissions = {
    type: 'object',
    readOnly: true,
    description: 'What the caller may do with this record: update and delete, and on a get also `fields`, the mode (`edit` or `read`) of each field',
    properties: { update: { type: 'boolean' }, delete: { type: 'boolean' }, fields: { type: 'object', additionalProperties: { type: 'string', enum: ['edit', 'read'] } } },
  }
  record.required = [...(record.required ?? []), 'etag']

  // Sensitive fields are written like any other; they are only left out of the record
  const writable = access.readable
  const body = (names: string[]) => {
    const properties = only(input.schema, names).properties
    const optional = new Set(names.filter((field) => writable.fields[field]?.nullable || (writable.fields[field]?.default && 'db' in writable.fields[field]!.default!)))
    for (const field of names) {
      const fieldModel = writable.fields[field]
      if (fieldModel?.default && 'db' in fieldModel.default && properties[field]) properties[field].description = 'Defaults to a value the database generates'
      if (fieldModel?.file && properties[field]) properties[field].description = `The \`value\` of \`POST /${entry.name}:upload?field=${field}\`, or the stored \`uri\` to keep the file`
    }
    const required = (input.schema.required as string[] | undefined)?.filter((field) => names.includes(field) && !optional.has(field)) ?? []
    return { type: 'object', properties, ...(required.length > 0 && { required }), additionalProperties: false } as JsonSchema
  }
  const create = body(writableFields(access, 'create'))
  const update = { ...body(writableFields(access, 'update')) }
  delete update.required
  return {
    [name]: record,
    ...(resolved.operations.create && { [`${name}Create`]: create }),
    ...(resolved.operations.update && { [`${name}Update`]: update }),
    ...output.hoisted,
    ...(Object.values(model.fields).some((field) => field.file) && { File: fileSchema }),
  } as Record<string, JsonSchema>
}
