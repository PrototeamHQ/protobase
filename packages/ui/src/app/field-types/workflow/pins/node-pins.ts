import { expressionSource, inputSchema, parseReference, pinType, resultSchema, schemaAt, stepStatusSchema, triggerSchema, type Definition, type PinSchemas, type PinType, type State } from '@protobase/workflows'

type JsonSchema = Record<string, unknown>

/**
 * What an input holds: nothing; a value of its own; an expression that computes; one read by name, drawn as a wire;
 * or an object whose fields read values, drawn as a Make node.
 */
export type InputState = 'empty' | 'literal' | 'expression' | 'wired' | 'made'

/** A pin on the left of a step: an argument of its type, with its type, whether the type needs it, and what it holds. */
export type InputPin = { key: string; type: PinType; required: boolean; value: unknown; state: InputState; options?: readonly string[] }

/** A pin on the right of a node: the value at `path` in what it gives, with its type. */
export type OutputPin = { path: string[]; type: PinType }

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const propertiesOf = (schema: JsonSchema | undefined): [string, JsonSchema][] => {
  if (!schema) return []
  const branches = [schema.anyOf, schema.oneOf].find(Array.isArray) as unknown[] | undefined
  const own = isObject(schema.properties) ? Object.entries(schema.properties).filter((entry): entry is [string, JsonSchema] => isObject(entry[1])) : []
  if (own.length > 0 || !branches) return own
  return branches.filter(isObject).flatMap((branch) => propertiesOf(branch as JsonSchema))
}

/** The fields of an object a schema describes, each with its schema; none when it names none. */
export const fieldsOf = (schema: JsonSchema | undefined) => propertiesOf(schema)

/** What an input's value is, as its pin shows it. */
export const inputState = (value: unknown): InputState => {
  if (value === undefined || value === '') return 'empty'
  if (parseReference(value)) return 'wired'
  if (expressionSource(value) !== undefined) return 'expression'
  if (isObject(value) && Object.values(value).some((field) => parseReference(field))) return 'made'
  return 'literal'
}

const argumentsOf = (state: State): Record<string, unknown> => ('Arguments' in state && isObject(state.Arguments) ? state.Arguments : {})

/** An input pin for the value at `key`, typed by its schema, with the choices an enum offers. */
export const inputPin = (key: string, schema: JsonSchema, value: unknown, required: boolean): InputPin => {
  const options = Array.isArray(schema.enum) && schema.enum.every((option) => typeof option === 'string') ? (schema.enum as string[]) : undefined
  return { key, type: pinType(schema), required, value, state: inputState(value), ...(options && { options }) }
}

/** A step's input pins: one per argument its type takes, in the order its schema declares them. */
export const inputPins = (state: State, schemas: PinSchemas): InputPin[] => {
  const schema = inputSchema(state, schemas)
  if (!schema) return []
  const required = Array.isArray(schema.required) ? (schema.required as string[]) : []
  const args = argumentsOf(state)
  return fieldsOf(schema).map(([key, field]) => inputPin(key, field, args[key], required.includes(key)))
}

// The pins of what a node gives: one per value it returns, as the fields of an untitled object, as a Blueprint's
// function gives each output its own pin; one for the whole of a titled object, such as a record, which a Break takes apart.
const outputsOf = (schema: JsonSchema | undefined): OutputPin[] => {
  const fields = typeof schema?.title === 'string' ? [] : fieldsOf(schema)
  if (fields.length === 0) return [{ path: [], type: pinType(schema) }]
  return fields.map(([key, field]) => ({ path: [key], type: pinType(field) }))
}

/** What a step gives later steps by name: a Task's result by its type, a Map's or a Block's whole; nothing for the others. */
export const stepOutputs = (state: State, schemas: PinSchemas): OutputPin[] => {
  if (state.Type === 'Task') return outputsOf(resultSchema(state, schemas))
  if (state.Type === 'Map') return [{ path: [], type: pinType({ type: 'array' }) }]
  if (state.Type === 'Block') return [{ path: [], type: pinType(undefined) }]
  return []
}

/** What the trigger gives as the run's input: its fields by its type, or the whole input of a manual workflow. */
export const triggerOutputs = (definition: Definition, schemas: PinSchemas): OutputPin[] => outputsOf(triggerSchema(definition, schemas))

/** In data order, the pin a state's status comes out of, and the one its Condition takes, which other values' pins never are. */
export const statusKey = '#status'
export const conditionKey = '#condition'

/** A state's status pin, in data order: `$states.context.Steps.<name>`. */
export const statusPin: OutputPin = { path: [statusKey], type: pinType(stepStatusSchema) }

/** A state's Only when pin, in data order: its Condition, true or false. */
export const conditionPin = (state: State): InputPin => ({ key: conditionKey, type: { kinds: ['boolean'] }, required: false, value: state.Condition, state: inputState(state.Condition) })

/** The schema of the value at `path` of what a node gives, for its Break nodes: a Task's result, the run's input, or a state's status. */
export const givenSchema = (definition: Definition, state: State | undefined, schemas: PinSchemas, path: readonly string[]) => {
  if (path[0] === statusKey) return schemaAt(stepStatusSchema, path.slice(1))
  return schemaAt(state ? resultSchema(state, schemas) : triggerSchema(definition, schemas), path)
}
