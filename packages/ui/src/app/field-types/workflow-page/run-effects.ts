import type { WorkflowTypeList } from '@protobase/client'
import { resultRead, type Definition, type Machine, type State, type TaskState } from '@protobase/workflows'
import { stateLabel } from '../workflow/labels'

const nextOf = (state: State): string[] => {
  const along: string[] = []
  if ('Next' in state && state.Next !== undefined) along.push(state.Next)
  if (state.Type === 'Choice') {
    for (const rule of state.Choices ?? []) along.push(rule.Next)
    if (state.Default !== undefined) along.push(state.Default)
  }
  if ('Catch' in state) for (const catcher of state.Catch ?? []) along.push(catcher.Next)
  return along
}

/** The states a run reaches from `start` along every edge, `start` first. */
export const reachedStates = (machine: Machine, start: string) => {
  const seen = new Set<string>()
  const queue = [start]
  while (queue.length > 0) {
    const name = queue.shift()!
    const state = machine.States[name]
    if (seen.has(name) || !state) continue
    seen.add(name)
    queue.push(...nextOf(state))
  }
  return [...seen]
}

// A request whose method is GET or left out only reads, as the HTTP step's own `writes` decides; an expression could be anything
const readsOnly = (state: TaskState) => {
  if (state.Resource !== 'app:http' || typeof state.Arguments !== 'object' || state.Arguments === null) return false
  const method = (state.Arguments as { method?: unknown }).method
  return method === undefined || (typeof method === 'string' && method.toUpperCase() === 'GET')
}

const actingSteps = (machine: Machine, names: readonly string[], types: WorkflowTypeList | undefined): { name: string; kind: string }[] =>
  names.flatMap((name) => {
    const state = machine.States[name]
    if (!state) return []
    const inside = state.Type === 'Map' ? actingSteps(state.ItemProcessor, reachedStates(state.ItemProcessor, state.ItemProcessor.StartAt), types) : []
    if (state.Type !== 'Task') return inside
    // A step type the app no longer lists writes as far as anyone can tell
    const writes = types?.step_types.find((type) => type.id === state.Resource)?.writes ?? true
    return writes === false || readsOnly(state) ? [] : [{ name, kind: stateLabel(state, types) }]
  })

// A variable that keeps a step's whole result is no change to what a run of it did: a re-run gives it from the kept step
const withoutResultVariables = (state: State | undefined) => {
  if (!state || !('Assign' in state) || !state.Assign) return state
  const assign = Object.fromEntries(Object.entries(state.Assign).filter(([, value]) => value !== resultRead))
  const { Assign: _, ...rest } = state
  return Object.keys(assign).length === 0 ? rest : { ...rest, Assign: assign }
}

/** Whether a state of the workflow itself differs between the version a run ran and `definition`, in what a kept step would miss. */
export const changedSinceRun = (ran: Definition | undefined, definition: Definition, state: string) => JSON.stringify(withoutResultVariables(ran?.stateMachine.States[state])) !== JSON.stringify(withoutResultVariables(definition.stateMachine.States[state]))

/** The steps that act on the world among those a run of `definition` reaches from `start`, its first state by default, Maps looked into. */
export const stepsThatAct = (definition: Definition, types: WorkflowTypeList | undefined, start = definition.stateMachine.StartAt) => actingSteps(definition.stateMachine, reachedStates(definition.stateMachine, start), types)
