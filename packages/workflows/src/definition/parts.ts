import type { Definition, Order, StateMachine, Trigger } from './types'

/**
 * A definition as a workflow and each of its versions keep it, in fields of their own: the state machine, exactly as the
 * States Language writes it, what starts its runs, the order its states run in, the account each of its connections
 * signs in with, and which of its runs keep a trace.
 */
export type DefinitionParts = {
  state_machine: unknown
  trigger: unknown
  execution_order?: Order | null
  connections?: Record<string, string> | null
  trace?: Definition['trace'] | null
}

/** The definition its parts make, as the runner and the check read it. */
export const definitionFromParts = (parts: DefinitionParts): Definition => ({
  trigger: parts.trigger as Trigger,
  order: parts.execution_order ?? 'sequence',
  stateMachine: parts.state_machine as StateMachine,
  ...(parts.connections && { connections: parts.connections }),
  ...(parts.trace && { trace: parts.trace }),
})

/** A definition's parts, to save as a workflow's fields. */
export const partsOfDefinition = (definition: Definition): Required<DefinitionParts> => ({
  state_machine: definition.stateMachine,
  trigger: definition.trigger,
  execution_order: definition.order ?? 'sequence',
  connections: definition.connections ?? null,
  trace: definition.trace ?? null,
})

/** The field a definition's problem is about: the trigger's, or the state machine's. */
export const partOfProblem = (field: string | undefined) => (field?.startsWith('trigger') ? 'trigger' : field === 'order' ? 'execution_order' : 'state_machine')
