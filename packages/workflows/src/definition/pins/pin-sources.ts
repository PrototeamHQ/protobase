import { allStates, innerMachine } from '../inner'
import type { Definition, Machine, State } from '../types'
import type { Reference } from './references'
import { resolveSchema, schemaAt, type RecordSchemas } from './resolve-schema'

type JsonSchema = Record<string, unknown>

/** What the types of pins are read from: each step type's input and each step and trigger type's output, by id, and the records of the app's resources. */
export type PinSchemas = {
  inputs: Readonly<Record<string, JsonSchema>>
  outputs: Readonly<Record<string, JsonSchema>>
  records: RecordSchemas
}

const resultRead = '{% $states.result %}'

export const argumentsOf = (state: State): Record<string, unknown> => {
  const args = 'Arguments' in state ? state.Arguments : undefined
  return typeof args === 'object' && args !== null && !Array.isArray(args) ? (args as Record<string, unknown>) : {}
}

/** The state that keeps its whole result in `variable`, when exactly one does; its name. */
export const resultState = (machine: Machine, variable: string): [string, State] | undefined => {
  const keeping = allStates(machine).filter(([, state]) => {
    const assign = 'Assign' in state ? (state.Assign as Record<string, unknown> | undefined) : undefined
    return assign?.[variable] !== undefined
  })
  if (keeping.length !== 1) return
  const [name, state] = keeping[0]!
  return (state as { Assign: Record<string, unknown> }).Assign[variable] === resultRead ? [name, state] : undefined
}

/** A Task's result as its type gives it, with what its arguments name filled in; undefined for any other state or an unknown type. */
export const resultSchema = (state: State, schemas: PinSchemas) =>
  state.Type === 'Task' && schemas.outputs[state.Resource] ? resolveSchema(schemas.outputs[state.Resource]!, argumentsOf(state), schemas.records) : undefined

/** The run's input as the trigger gives it, with what its input names filled in; undefined for a manual workflow. */
export const triggerSchema = (definition: Definition, schemas: PinSchemas) => {
  const [id, input] = Object.entries(definition.trigger ?? {})[0] ?? []
  if (id === undefined || id === 'manual' || !schemas.outputs[id]) return
  return resolveSchema(schemas.outputs[id]!, (input ?? {}) as Record<string, unknown>, schemas.records)
}

/**
 * The schema of the value a reference reads, in a state outside any Block: the trigger's run input, or the result a
 * state keeps whole in a variable, down the reference's path; undefined when nothing says, so it is of any type.
 */
export const referenceSchema = (definition: Definition, reference: Reference, schemas: PinSchemas): JsonSchema | undefined => {
  const { base, path } = reference
  if ('input' in base) return schemaAt(triggerSchema(definition, schemas), path)
  const found = resultState(definition.stateMachine, base.variable)
  return found && schemaAt(resultSchema(found[1], schemas), path)
}

/** A Task's input as its type takes it, with what its arguments name filled in, such as the record a records step writes. */
export const inputSchema = (state: State, schemas: PinSchemas) =>
  state.Type === 'Task' && schemas.inputs[state.Resource] ? resolveSchema(schemas.inputs[state.Resource]!, argumentsOf(state), schemas.records) : undefined

/** Every Task of a machine outside any Block, with its path, the ones in Maps too: a Block's steps read only its own input. */
export const tasksOutsideBlocks = (machine: Machine, scope: readonly string[] = []): { path: string; state: State }[] =>
  Object.entries(machine.States).flatMap(([name, state]) => {
    const here = [{ path: [...scope, name].join('/'), state }]
    const inner = state.Type === 'Map' ? innerMachine(state) : undefined
    return [...here, ...(inner ? tasksOutsideBlocks(inner, [...scope, name]) : [])]
  }).filter(({ state }) => state.Type === 'Task')

