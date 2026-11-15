import { Ajv } from 'ajv'
import type { JsonSchema } from './context'

const ajv = new Ajv({ allErrors: true, strict: false })

// Forgets a schema Ajv may have kept; one it could not take, such as one whose $id is no text, it never kept, and
// removing it would fail as compiling it did.
const forget = (schema: JsonSchema) => {
  try {
    ajv.removeSchema(schema)
  } catch {
    // Nothing was kept
  }
}

/**
 * Why `value` does not fit `schema`, a JSON Schema an argument gave, such as the body an HTTP answer was declared to
 * have: one line per problem naming where it is (`body.ip must be string`); a schema that does not compile is one, and
 * so is an asynchronous one (`$async`), whose answer would come later. Empty when it fits.
 */
export const valueProblems = (schema: JsonSchema, value: unknown, name = 'value'): string[] => {
  if (schema.$async === true) return ['the schema is asynchronous ($async), which a value is not checked against']
  let validate
  try {
    validate = ajv.compile(schema)
  } catch (error) {
    forget(schema)
    return [`the schema is not valid JSON Schema: ${error instanceof Error ? error.message : String(error)}`]
  }
  // Each run gives its own schema object: one kept in Ajv's cache would stay there for the life of the process
  try {
    if (validate(value)) return []
    return (validate.errors ?? []).map((error) => `${[name, ...error.instancePath.split('/').slice(1)].join('.')} ${error.message}`)
  } finally {
    forget(schema)
  }
}
