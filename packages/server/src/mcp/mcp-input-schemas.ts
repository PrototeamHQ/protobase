import { fromJsonSchema } from '@modelcontextprotocol/server'
import type { AssistantTool } from '../assistant/tools'

type InputSchema = ReturnType<typeof fromJsonSchema<Record<string, unknown>>>

/**
 * Turns a tool's parameters object into its MCP input schema, keeping the last `limit` it turned, least recently used
 * dropped first. The SDK compiles each schema object it is given into a cache that never lets go, so a server built per
 * request from the same tools gets the same input schema and adds nothing to it.
 */
export const inputSchemaMemo = (limit: number) => {
  const schemas = new Map<object, InputSchema>()
  return (parameters: AssistantTool['parameters']) => {
    const known = schemas.get(parameters)
    if (known) {
      // Moved to the end of the Map's insertion order, which makes it the most recently used.
      schemas.delete(parameters)
      schemas.set(parameters, known)
      return known
    }
    const schema = fromJsonSchema<Record<string, unknown>>(parameters)
    schemas.set(parameters, schema)
    if (schemas.size > limit) schemas.delete(schemas.keys().next().value!)
    return schema
  }
}
