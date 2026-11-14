import type { Problem } from '../problem'
import type { Definition } from '../types'
import { pinType, fits, pinTypeText } from './pin-type'
import { argumentsOf, inputSchema, referenceSchema, tasksOutsideBlocks, type PinSchemas } from './pin-sources'
import { parseReference, readText } from './references'
import { schemaAt } from './resolve-schema'

type JsonSchema = Record<string, unknown>

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Where a Task's argument, or a field of an argument written as an object, is one read by name of a value whose type
 * does not fit what the step type takes there, as a wire between pins of those types is refused: a problem naming
 * both. A read of a value of any type, or into an input of any type, fits.
 */
export const pinProblems = (definition: Definition, schemas: PinSchemas): Problem[] =>
  tasksOutsideBlocks(definition.stateMachine).flatMap(({ path, state }) => {
    const input = inputSchema(state, schemas)
    if (!input) return []
    const mismatch = (value: unknown, target: JsonSchema | undefined, field: string[]): Problem[] => {
      const reference = parseReference(value)
      if (!reference || !target) return []
      const source = pinType(referenceSchema(definition, reference, schemas))
      const taken = pinType(target)
      if (fits(source, taken)) return []
      return [{ state: path, field: ['Arguments', ...field].join('.'), message: `reads ${readText(reference)}, ${pinTypeText(source)}, where ${field.join('.')} takes ${pinTypeText(taken)}` }]
    }
    return Object.entries(argumentsOf(state)).flatMap(([key, value]) => {
      const target = schemaAt(input, [key])
      if (!isObject(value)) return mismatch(value, target, [key])
      return Object.entries(value).flatMap(([field, inner]) => mismatch(inner, schemaAt(target, [field]), [key, field]))
    })
  })
