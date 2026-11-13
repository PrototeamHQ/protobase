import type { Definition, Machine, State, Trigger } from '@protobase/workflows'
import { allNames, machineAt, splitPath, type StatePath } from './definition'
import type { EdgeKind, GraphEdge } from './definition-graph'

/** What a new state is: a Task of a step type (`app:http`), or a state of another type (`Choice`). */
export type NewState = { task: string } | { type: Exclude<State['Type'], 'Task'> }

// Each edit works on a copy, so the definition it is given stays as it was.
const edited = (definition: Definition, change: (copy: Definition) => void) => {
  const copy = structuredClone(definition)
  change(copy)
  return copy
}

// The states that go on along their Next: a Choice goes on by its rules, Succeed and Fail end.
const flowing = new Set<State['Type']>(['Task', 'Pass', 'Wait', 'Map', 'Block'])

const withNext = (state: State, target: string) => {
  if (!flowing.has(state.Type)) return
  const flow = state as { Next?: string; End?: boolean }
  delete flow.End
  flow.Next = target
}

const machineOf = (definition: Definition, scope: readonly string[]) => {
  const machine = machineAt(definition, scope)
  if (!machine) throw new Error(`No Map or Block at ${scope.join('/')}`)
  return machine
}

/** The first of `Step 1`, `Step 2`, ... that no state of the definition is named yet: names are unique across Maps. */
export const freeName = (definition: Definition, base: string) => {
  const taken = new Set(allNames(definition.stateMachine))
  let number = 1
  while (taken.has(`${base} ${number}`)) number++
  return `${base} ${number}`
}

const freshState = (kind: NewState): State => {
  if ('task' in kind) return { Type: 'Task', Resource: kind.task, Arguments: {}, End: true }
  if (kind.type === 'Choice') return { Type: 'Choice', Choices: [] }
  if (kind.type === 'Wait') return { Type: 'Wait', Seconds: 60, End: true }
  if (kind.type === 'Succeed') return { Type: 'Succeed' }
  if (kind.type === 'Fail') return { Type: 'Fail' }
  if (kind.type === 'Pass') return { Type: 'Pass', End: true }
  if (kind.type === 'Block') return { Type: 'Block', Processor: { StartAt: '', States: {} }, Cache: { Ttl: '1 hour' }, End: true }
  return { Type: 'Map', Items: '{% [] %}', ItemProcessor: { StartAt: '', States: {} }, End: true }
}

/**
 * Adds a state named `name` to the machine at `scope`, not yet connected: it ends the run, or its Map item, and is
 * reached once a state leads to it. In a machine without states it is the first. A Map or a Block comes with one state
 * of its own, named after `base` as `freeName` names it, since a machine has at least one.
 */
export const addState = (definition: Definition, scope: readonly string[], kind: NewState, name: string, base: string) =>
  edited(definition, (copy) => {
    const machine = machineOf(copy, scope)
    const state = freshState(kind)
    machine.States[name] = state
    if (!Object.hasOwn(machine.States, machine.StartAt)) machine.StartAt = name
    if (state.Type !== 'Map' && state.Type !== 'Block') return
    const first = freeName(copy, base)
    const inner: Machine = { StartAt: first, States: { [first]: { Type: 'Pass', End: true } } }
    if (state.Type === 'Map') state.ItemProcessor = inner
    else state.Processor = inner
  })

// Whether a new state can go on to the state it takes the place of: a Succeed or a Fail ends the run instead.
const goesOn = (state: State) => state.Type === 'Choice' || flowing.has(state.Type)

// Connects a new state after `after`: it takes over where `after` went on to, and `after` goes on to it. A state that
// ends the run stays unconnected there, so it never cuts off the states after it.
const follow = (machine: Machine, after: string, name: string) => {
  const before = machine.States[after]
  const state = machine.States[name]!
  if (!before || !flowing.has(before.Type)) return
  const next = (before as { Next?: string }).Next
  if (next !== undefined && !goesOn(state)) return
  withNext(before, name)
  if (next === undefined) return
  if (state.Type === 'Choice') state.Default = next
  else if (flowing.has(state.Type)) withNext(state, next)
}

/**
 * Where a new state goes in the machine at `scope`: after the state chosen, or the last one with nothing after it, as
 * when the Map or Block chosen is the one at `scope`; with the trigger chosen, first; `undefined` when it stays
 * unconnected, after a state that goes on by its rules or ends.
 */
export const placeAfter = (definition: Definition, scope: readonly string[], chosen: string | undefined): string | undefined => {
  const machine = machineOf(definition, scope)
  if (chosen !== undefined && chosen !== scope.join('/')) {
    const { name } = splitPath(chosen)
    return flowing.has(machine.States[name]?.Type as State['Type']) ? name : undefined
  }
  return Object.keys(machine.States).reverse().find((name) => (machine.States[name] as { End?: boolean }).End === true)
}

/** Adds a state as `addState` does, and connects it after the state named `after` in its machine. */
export const addStateAfter = (definition: Definition, scope: readonly string[], kind: NewState, name: string, base: string, after: string | undefined) => {
  const added = addState(definition, scope, kind, name, base)
  if (after === undefined) return added
  return edited(added, (copy) => follow(machineOf(copy, scope), after, name))
}

/**
 * Adds a state as the first of the workflow, going on to the one that was first. A state that ends the run stays
 * unconnected when the workflow has a first state, so it never cuts off the states after it.
 */
export const addStateFirst = (definition: Definition, kind: NewState, name: string, base: string) => {
  const first = definition.stateMachine.StartAt
  const added = addState(definition, [], kind, name, base)
  return edited(added, (copy) => {
    const state = copy.stateMachine.States[name]!
    if (first !== '' && !goesOn(state)) return
    copy.stateMachine.StartAt = name
    if (first !== '' && flowing.has(state.Type)) withNext(state, first)
    if (first !== '' && state.Type === 'Choice') state.Default = first
  })
}

// A state that names `target` no longer does: its Next ends it, and its rule, Default or catcher goes.
const forget = (state: State, target: string) => {
  if ('Next' in state && state.Next === target) {
    delete state.Next
    ;(state as { End?: boolean }).End = true
  }
  if (state.Type === 'Choice') {
    state.Choices = (state.Choices ?? []).filter((rule) => rule.Next !== target)
    if (state.Default === target) delete state.Default
  }
  if ('Catch' in state && state.Catch) {
    state.Catch = state.Catch.filter((catcher) => catcher.Next !== target)
    if (state.Catch.length === 0) delete state.Catch
  }
}

/** Removes a state, and every edge to it; when the machine started at it, it starts at its first state left. */
export const removeState = (definition: Definition, path: StatePath) =>
  edited(definition, (copy) => {
    const { scope, name } = splitPath(path)
    const machine = machineOf(copy, scope)
    delete machine.States[name]
    for (const state of Object.values(machine.States)) forget(state, name)
    if (machine.StartAt === name) machine.StartAt = Object.keys(machine.States)[0] ?? ''
  })

/**
 * Draws an edge from the handle `kind` of `source` to `target`, both of the same machine: `next` sets the source's
 * Next in place of End, `rule` adds a Choice rule whose condition is still to write, `default` sets the Choice's
 * Default, `catch` adds a catcher of every error, and `start` makes the target the first state of the workflow.
 */
export const connect = (definition: Definition, kind: EdgeKind, source: string, target: StatePath) =>
  edited(definition, (copy) => {
    const { scope, name } = splitPath(target)
    if (kind === 'start') {
      copy.stateMachine.StartAt = name
      return
    }
    const from = splitPath(source)
    if (from.scope.join('/') !== scope.join('/')) throw new Error('A state leads only to states of its own machine')
    const state = machineOf(copy, scope).States[from.name]
    if (!state) return
    if (kind === 'next') withNext(state, name)
    if (kind === 'rule' && state.Type === 'Choice') state.Choices = [...(state.Choices ?? []), { Condition: '', Next: name }]
    if (kind === 'default' && state.Type === 'Choice') state.Default = name
    if (kind === 'catch' && (state.Type === 'Task' || state.Type === 'Map' || state.Type === 'Block')) state.Catch = [...(state.Catch ?? []), { ErrorEquals: ['States.ALL'], Next: name }]
  })

/** Removes an edge: a Next ends its state instead, and a rule, Default or catcher goes. The trigger's edge stays. */
export const disconnect = (definition: Definition, edge: Pick<GraphEdge, 'kind' | 'source' | 'field'>) =>
  edited(definition, (copy) => {
    if (edge.kind === 'start') return
    const { scope, name } = splitPath(edge.source)
    const state = machineOf(copy, scope).States[name]
    if (!state) return
    const index = Number(/\[(\d+)\]/.exec(edge.field)?.[1])
    if (edge.kind === 'next' && 'Next' in state) {
      delete state.Next
      ;(state as { End?: boolean }).End = true
    }
    if (edge.kind === 'rule' && state.Type === 'Choice') state.Choices = state.Choices.filter((_, at) => at !== index)
    if (edge.kind === 'default' && state.Type === 'Choice') delete state.Default
    if (edge.kind === 'catch' && 'Catch' in state && state.Catch) {
      state.Catch = state.Catch.filter((_, at) => at !== index)
      if (state.Catch.length === 0) delete state.Catch
    }
  })

/** Puts `state` in place of the state at `path`. */
export const replaceState = (definition: Definition, path: StatePath, state: State) =>
  edited(definition, (copy) => {
    const { scope, name } = splitPath(path)
    machineOf(copy, scope).States[name] = state
  })

const renamedIn = (machine: Machine, from: string, to: string) => {
  // The order of the states stays, with the renamed one where it was
  machine.States = Object.fromEntries(Object.entries(machine.States).map(([name, state]) => [name === from ? to : name, state]))
  if (machine.StartAt === from) machine.StartAt = to
  for (const state of Object.values(machine.States)) {
    if ('Next' in state && state.Next === from) state.Next = to
    if (state.Type === 'Choice') {
      for (const rule of state.Choices ?? []) if (rule.Next === from) rule.Next = to
      if (state.Default === from) state.Default = to
    }
    if ('Catch' in state) for (const catcher of state.Catch ?? []) if (catcher.Next === from) catcher.Next = to
  }
}

/** Renames the state at `path`, and every edge and the StartAt naming it. */
export const renameState = (definition: Definition, path: StatePath, to: string) =>
  edited(definition, (copy) => {
    const { scope, name } = splitPath(path)
    renamedIn(machineOf(copy, scope), name, to)
  })

/** Makes the state at `path` the first of its machine. */
export const startAt = (definition: Definition, path: StatePath) =>
  edited(definition, (copy) => {
    const { scope, name } = splitPath(path)
    machineOf(copy, scope).StartAt = name
  })

/** Puts `trigger` in place of the workflow's trigger. */
export const setTrigger = (definition: Definition, trigger: Trigger) =>
  edited(definition, (copy) => {
    copy.trigger = trigger
  })
