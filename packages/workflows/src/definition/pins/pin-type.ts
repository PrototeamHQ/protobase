type JsonSchema = Record<string, unknown>

/** What a pin's value can be, as JSON Schema's types name it. */
export type PinKind = 'string' | 'integer' | 'number' | 'boolean' | 'object' | 'array' | 'null'

/** A pin's type: the kinds its value can be, or `any` when its schema says nothing, with the schema's title. */
export type PinType = { kinds: readonly PinKind[] | 'any'; title?: string }

const kinds: readonly PinKind[] = ['string', 'integer', 'number', 'boolean', 'object', 'array', 'null']

const isSchema = (value: unknown): value is JsonSchema => typeof value === 'object' && value !== null && !Array.isArray(value)

// The kinds a schema's own `type` allows, none when it names none.
const declaredKinds = (schema: JsonSchema) => (Array.isArray(schema.type) ? schema.type : schema.type === undefined ? [] : [schema.type]).filter((kind): kind is PinKind => kinds.includes(kind as PinKind))

// A schema with branches allows what any branch allows, within its own `type` when it has one, which applies too.
const kindsOf = (schema: JsonSchema): PinKind[] | 'any' => {
  const known = declaredKinds(schema)
  const branches = [schema.anyOf, schema.oneOf].find(Array.isArray) as unknown[] | undefined
  if (branches) {
    const each = branches.filter(isSchema).map(kindsOf)
    if (each.includes('any')) return known.length > 0 ? known : 'any'
    const either = [...new Set(each.flat() as PinKind[])]
    return known.length > 0 ? either.filter((kind) => known.includes(kind) || (kind === 'integer' && known.includes('number'))) : either
  }
  if (known.length > 0) return known
  if (Array.isArray(schema.enum) && schema.enum.every((value) => typeof value === 'string')) return ['string']
  if (isSchema(schema.properties)) return ['object']
  return 'any'
}

/** The type of a pin whose value `schema` describes. */
export const pinType = (schema: JsonSchema | undefined): PinType => {
  if (!schema) return { kinds: 'any' }
  const title = typeof schema.title === 'string' ? schema.title : undefined
  return { kinds: kindsOf(schema), ...(title !== undefined && { title }) }
}

/**
 * Whether a value of `source` fits a pin of `target`: every kind the source can be, the target takes; a whole number
 * fits a number, and a pin of any type fits and takes anything, as its value is known only when the run gets it.
 */
export const fits = (source: PinType, target: PinType) => {
  if (source.kinds === 'any' || target.kinds === 'any') return true
  const taken = target.kinds
  return source.kinds.every((kind) => taken.includes(kind) || (kind === 'integer' && taken.includes('number')))
}

const kindNames: Record<PinKind, string> = { string: 'text', integer: 'a whole number', number: 'a number', boolean: 'true or false', object: 'an object', array: 'a list', null: 'null' }

/** A type in words, for a problem's message: its title, or what it can be, such as `text or a whole number`. */
export const pinTypeText = (type: PinType) => {
  if (type.title !== undefined) return type.title
  if (type.kinds === 'any') return 'any value'
  return type.kinds.map((kind) => kindNames[kind]).join(' or ')
}
