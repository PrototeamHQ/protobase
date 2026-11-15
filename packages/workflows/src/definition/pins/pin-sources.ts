import { innerMachine } from '../inner'
import { expressionSource } from '../expressions'
import type { BlockState, Definition, Machine, State } from '../types'
import { taskResource } from '../task-resource'
import type { Reference } from './references'
import { resolveSchema, schemaAt, type RecordSchemas } from './resolve-schema'

type JsonSchema = Record<string, unknown>

/** What the types of pins are read from: each step type's input and each step and trigger type's output, by id, and the records of the app's resources. */
export type PinSchemas = {
  inputs: Readonly<Record<string, JsonSchema>>
  outputs: Readonly<Record<string, JsonSchema>>
  records: RecordSchemas
}


export const argumentsOf = (state: State): Record<string, unknown> => {
  const args = 'Arguments' in state ? state.Arguments : undefined
  return typeof args === 'object' && args !== null && !Array.isArray(args) ? (args as Record<string, unknown>) : {}
}

// The states of a machine and of the Maps in it, whose variables a state outside any Block may read: a Block's steps
// keep theirs to themselves.
const statesOutsideBlocks = (machine: Machine): [string, State][] =>
  Object.entries(machine.States).flatMap(([name, state]) => {
    const inner = state.Type === 'Map' ? innerMachine(state) : undefined
    return [[name, state] as [string, State], ...(inner ? statesOutsideBlocks(inner) : [])]
  })

/** The state outside any Block that keeps its whole result in `variable`, when exactly one does; its name. */
export const resultState = (machine: Machine, variable: string): [string, State] | undefined => {
  const keeping = statesOutsideBlocks(machine).filter(([, state]) => {
    const assign = 'Assign' in state ? (state.Assign as Record<string, unknown> | undefined) : undefined
    return assign?.[variable] !== undefined
  })
  if (keeping.length !== 1) return
  const [name, state] = keeping[0]!
  // However the expression is spaced
  return expressionSource((state as { Assign: Record<string, unknown> }).Assign[variable])?.trim() === '$states.result' ? [name, state] : undefined
}

/**
 * A Task's result as its type gives it, with what its arguments name filled in; undefined for any other state, an
 * unknown type, or a Task that waits for an outside result, which is what its executor sends back.
 */
export const resultSchema = (state: State, schemas: PinSchemas) => {
  if (state.Type !== 'Task') return
  const { type, waits } = taskResource(state.Resource)
  return !waits && schemas.outputs[type] ? resolveSchema(schemas.outputs[type]!, argumentsOf(state), schemas.records) : undefined
}

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
/** What `$states.context.Steps.<name>` gives in data order: a state's status, its error and cause. */
export const stepStatusSchema: JsonSchema = {
  type: 'object',
  title: 'Step status',
  properties: { Status: { enum: ['SUCCEEDED', 'FAILED', 'TIMED_OUT', 'ABORTED', 'SKIPPED'] }, Error: { type: ['string', 'null'] }, Cause: { type: ['string', 'null'] } },
}

export const referenceSchema = (definition: Definition, reference: Reference, schemas: PinSchemas): JsonSchema | undefined => {
  const { base, path } = reference
  if ('input' in base) return schemaAt(triggerSchema(definition, schemas), path)
  if ('step' in base) return schemaAt(stepStatusSchema, path)
  const found = resultState(definition.stateMachine, base.variable)
  return found && schemaAt(resultSchema(found[1], schemas), path)
}

/** A Task's input as its type takes it, with what its arguments name filled in, such as the record a records step writes. */
export const inputSchema = (state: State, schemas: PinSchemas) => {
  if (state.Type !== 'Task') return
  const { type } = taskResource(state.Resource)
  return schemas.inputs[type] ? resolveSchema(schemas.inputs[type]!, argumentsOf(state), schemas.records) : undefined
}

/** Every Task of a machine outside any Block, with its path, the ones in Maps too: a Block's steps read only its own input. */
/** Every Block of a machine outside any other Block, with its path, the ones in Maps too. */
export const blocksOutsideBlocks = (machine: Machine, scope: readonly string[] = []): { path: string; state: BlockState }[] =>
  Object.entries(machine.States).flatMap(([name, state]) => {
    if (state.Type === 'Block') return [{ path: [...scope, name].join('/'), state }]
    const inner = state.Type === 'Map' ? innerMachine(state) : undefined
    return inner ? blocksOutsideBlocks(inner, [...scope, name]) : []
  })

export const tasksOutsideBlocks = (machine: Machine, scope: readonly string[] = []): { path: string; state: State }[] =>
  Object.entries(machine.States).flatMap(([name, state]) => {
    const here = [{ path: [...scope, name].join('/'), state }]
    const inner = state.Type === 'Map' ? innerMachine(state) : undefined
    return [...here, ...(inner ? tasksOutsideBlocks(inner, [...scope, name]) : [])]
  }).filter(({ state }) => state.Type === 'Task')

