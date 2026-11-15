type JsonSchema = Record<string, unknown>

/** How a record is used: as a step gives it (`read`), or as a create or an update takes it (`write`). */
export type RecordUse = 'read' | 'write'

/** A resource's record as JSON Schema, for a use; undefined for a resource the app does not have. */
export type RecordSchemas = (resource: string, use: RecordUse) => JsonSchema | undefined

const isSchema = (value: unknown): value is JsonSchema => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * A type's schema with what its arguments name filled in: `{ "x-record-of": "<argument>" }` is the record of the
 * resource that argument names, for the `x-record-use` it says (default `read`), and `{ "x-schema-of": "<argument>" }`
 * is the schema that argument holds, such as an HTTP answer's declared body, and `{ "x-one-or-many-of": "<argument>",
 * "anyOf": [<one>, <list>] }` is one or the list as that argument holds an object or a list. An argument that is an
 * expression, or a resource the app does not have, leaves the value of any type.
 */
export const resolveSchema = (schema: JsonSchema, args: Record<string, unknown>, records: RecordSchemas): JsonSchema => {
  const resolve = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(resolve)
    if (!isSchema(node)) return node
    const recordOf = node['x-record-of']
    if (typeof recordOf === 'string') {
      const resource = args[recordOf]
      const use = node['x-record-use'] === 'write' ? 'write' : 'read'
      const record = typeof resource === 'string' && !resource.startsWith('{%') ? records(resource, use) : undefined
      return record ?? withoutKeys(node, ['x-record-of', 'x-record-use'])
    }
    // One of an object and a list of them, as the argument it names holds one or a list
    const oneOrMany = node['x-one-or-many-of']
    if (typeof oneOrMany === 'string' && Array.isArray(node.anyOf) && node.anyOf.length === 2) {
      const given = args[oneOrMany]
      if (Array.isArray(given)) return resolve(node.anyOf[1])
      if (isSchema(given)) return resolve(node.anyOf[0])
      return resolve(withoutKeys(node, ['x-one-or-many-of']))
    }
    const schemaOf = node['x-schema-of']
    if (typeof schemaOf === 'string') {
      const given = args[schemaOf]
      return isSchema(given) ? given : withoutKeys(node, ['x-schema-of'])
    }
    return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, resolve(value)]))
  }
  return resolve(schema) as JsonSchema
}

const withoutKeys = (node: JsonSchema, keys: string[]) => Object.fromEntries(Object.entries(node).filter(([key]) => !keys.includes(key)))

/**
 * The schema of the value at `path` below a value of `schema`: a property's, or a map's `additionalProperties`; for a
 * schema of several kinds, any of the branches' schemas for it. Undefined when the schema, or one of its branches,
 * does not say, so the value is of any type.
 */
export const schemaAt = (schema: JsonSchema | undefined, path: readonly string[]): JsonSchema | undefined => {
  let current = schema
  for (const key of path) {
    if (!current) return
    current = fieldSchema(current, key)
  }
  return current
}

const fieldSchema = (schema: JsonSchema, key: string): JsonSchema | undefined => {
  const branches = [schema.anyOf, schema.oneOf].find(Array.isArray) as unknown[] | undefined
  if (branches) {
    // A branch that is true, or no schema, takes any value there
    if (branches.some((branch) => !isSchema(branch))) return
    const found = branches.filter(isSchema).map((branch) => fieldSchema(branch, key))
    if (found.length === 0 || found.some((each) => each === undefined)) return
    return found.length === 1 ? found[0] : { anyOf: found }
  }
  if (isSchema(schema.properties) && isSchema(schema.properties[key])) return schema.properties[key]
  if (isSchema(schema.additionalProperties)) return schema.additionalProperties
  return
}
