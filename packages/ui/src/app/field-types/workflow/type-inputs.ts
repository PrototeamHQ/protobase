/**
 * How a type's input is written in its form: `text`, one line kept as text, which may be an expression; `value`, one
 * line read as JSON when it parses, such as a number or `true`; `choice`, one of `options`; `json`, any JSON value or an
 * expression, such as an object of field values; `names`, a list of names, typed on one line separated by commas.
 */
export type InputKind = 'text' | 'value' | 'choice' | 'json' | 'names'

/** An input of a trigger or step type, from its JSON Schema: its name, how it is written, and whether a save needs it. */
export type TypeInput = { name: string; kind: InputKind; required: boolean; options?: readonly string[]; title?: string }

type Schema = Record<string, unknown>

const isSchema = (value: unknown): value is Schema => typeof value === 'object' && value !== null && !Array.isArray(value)

// The field a property's schema is written in: anything the plain fields do not fit, such as an object or a value of
// several types, is JSON.
const kindOf = (schema: Schema): Pick<TypeInput, 'kind' | 'options'> => {
  if (Array.isArray(schema.enum) && schema.enum.every((option) => typeof option === 'string')) return { kind: 'choice', options: schema.enum }
  if (schema.type === 'string') return { kind: 'text' }
  if (schema.type === 'number' || schema.type === 'integer' || schema.type === 'boolean') return { kind: 'value' }
  if (schema.type === 'array' && isSchema(schema.items) && schema.items.type === 'string') return { kind: 'names' }
  return { kind: 'json' }
}

/** The inputs of a type's input schema, in the order its `properties` declare them, those it `required` marked. */
export const schemaInputs = (input: Schema): TypeInput[] => {
  const properties = isSchema(input.properties) ? input.properties : {}
  const required = Array.isArray(input.required) ? input.required : []
  return Object.entries(properties).map(([name, property]) => {
    const schema = isSchema(property) ? property : {}
    const title = typeof schema.title === 'string' ? schema.title : undefined
    return { name, ...kindOf(schema), required: required.includes(name), ...(title && { title }) }
  })
}
