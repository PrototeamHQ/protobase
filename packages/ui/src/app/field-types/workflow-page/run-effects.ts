import type { WorkflowTypeList } from '@protobase/client'
import { dependsOn, innerMachine, machineDependencies, orderOf, resultRead, type Definition, type Machine, type State, type TaskState } from '@protobase/workflows'
import { stateLabel } from '../workflow/labels'

const nextOf = (state: State): string[] => {
  const along: string[] = []
  if ('Next' in state && state.Next !== undefined) along.push(state.Next)
  if (state.Type === 'Choice') {
    for (const rule of state.Choices ?? []) along.push(rule.Next)
    if (state.Default !== undefined) along.push(state.Default)
  }
  if ('Catch' in state) for (const catcher of state.Catch ?? []) if (catcher.Next !== undefined) along.push(catcher.Next)
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

// The states a run of a machine may run: those reached from its start, or every one of a machine in data order, which
// has no start and follows no edges.
const statesRun = (machine: Machine) => (machine.StartAt === undefined ? Object.keys(machine.States) : reachedStates(machine, machine.StartAt))

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
    const steps = innerMachine(state)
    const inside = steps ? actingSteps(steps, statesRun(steps), types) : []
    if (state.Type !== 'Task') return inside
    // A step type the app no longer lists writes as far as anyone can tell
    const writes = types?.step_types.find((type) => type.id === state.Resource)?.writes ?? true
    return writes === false || readsOnly(state) ? [] : [{ name, kind: stateLabel(state, types) }]
  })

// A variable that keeps a step's whole result is no change to what a run of it did: a re-run gives it from the kept step,
// unless that step's state shaped its result with Output in the version the run ran, as the re-run then cannot
const withoutResultVariables = (state: State | undefined, shaped: boolean) => {
  if (!state || shaped || !('Assign' in state) || !state.Assign) return state
  const assign = Object.fromEntries(Object.entries(state.Assign).filter(([, value]) => value !== resultRead))
  const { Assign: _, ...rest } = state
  return Object.keys(assign).length === 0 ? rest : { ...rest, Assign: assign }
}

/** Whether a state of the workflow itself differs between the version a run ran and `definition`, in what a kept step would miss. */
export const changedSinceRun = (ran: Definition | undefined, definition: Definition, state: string) => {
  const before = ran?.stateMachine.States[state]
  const shaped = before !== undefined && 'Output' in before
  return JSON.stringify(withoutResultVariables(before, shaped)) !== JSON.stringify(withoutResultVariables(definition.stateMachine.States[state], shaped))
}

// In data order, a state and every state that depends on it, through others too: those a re-run from it runs again
const dependents = (machine: Machine, start: string) => {
  const dependencies = machineDependencies(machine)
  const after = new Set([start])
  for (let grew = true; grew; ) {
    grew = false
    for (const [name, own] of dependencies) {
      if (after.has(name) || ![...dependsOn(own)].some((other) => after.has(other))) continue
      after.add(name)
      grew = true
    }
  }
  return Object.keys(machine.States).filter((name) => after.has(name))
}

/**
 * The steps that act on the world among those a run of `definition` runs from `start`, its first state by default,
 * Maps and Blocks looked into: in sequence order those reached along its edges; in data order, which follows none,
 * every step, or from `start` the steps that depend on it, as a re-run from it runs them again.
 */
export const stepsThatAct = (definition: Definition, types: WorkflowTypeList | undefined, start = definition.stateMachine.StartAt) => {
  const machine = definition.stateMachine
  const from = orderOf(definition) === 'data' ? (start === undefined ? statesRun(machine) : dependents(machine, start)) : start === undefined ? statesRun(machine) : reachedStates(machine, start)
  return actingSteps(machine, from, types)
}
