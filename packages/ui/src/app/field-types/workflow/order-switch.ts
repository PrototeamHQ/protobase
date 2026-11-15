import { stepName } from './definition-edits'
import { text } from './messages'
import { allStates, assignedNames, dependsOn, innerMachine, machineDependencies, orderOf, type Definition, type Machine, type State } from '@protobase/workflows'


/** A definition switched to the other order, or why it cannot be. */
export type Switched = { definition: Definition } | { refused: string }

const flowsOn = (state: State) => ['Task', 'Pass', 'Wait', 'Map', 'Block'].includes(state.Type)

// Every variable assigned once, as data order needs, else the first one assigned twice
const assignedTwice = (machine: Machine) => {
  const seen = new Set<string>()
  for (const [, state] of allStates(machine)) for (const name of assignedNames(state)) {
    if (seen.has(name)) return name
    seen.add(name)
  }
  return
}

// A Pass or Succeed without Output gives the input it got: in sequence order the output of the state before it, in data
// order the run's input. The first one whose output would change, of the machine or a Map's or Block's inside it, which
// the switch cannot keep: in sequence one that a Next leads to, in data order any but the one that would come first.
const givesItsInput = (state: State) => (state.Type === 'Pass' || state.Type === 'Succeed') && state.Output === undefined
const passThrough = (machine: Machine, toData: boolean, first?: string): string | undefined => {
  const led = new Set(Object.values(machine.States).flatMap((state) => ((state as { Next?: string }).Next === undefined ? [] : [(state as { Next: string }).Next])))
  for (const [name, state] of Object.entries(machine.States)) {
    if (givesItsInput(state) && (toData ? led.has(name) : name !== first)) return name
    const inner = innerMachine(state)
    const found = inner && passThrough(inner, toData, toData ? undefined : machineToSequence(inner).StartAt)
    if (found) return found
  }
  return
}

// A state that a chain of Nexts leads back to, in the machine or a Map's or Block's inside it, which runs more than once
// in sequence order: in data order each state runs once, after the ones it depends on, so a loop would wait on itself.
const looping = (machine: Machine): string | undefined => {
  for (const start of Object.keys(machine.States)) {
    const seen = new Set<string>()
    for (let name: string | undefined = start; name !== undefined && machine.States[name]; name = (machine.States[name] as { Next?: string }).Next) {
      if (seen.has(name)) return name
      seen.add(name)
    }
  }
  for (const state of Object.values(machine.States)) {
    const inner = innerMachine(state)
    const found = inner && looping(inner)
    if (found) return found
  }
  return
}

const statusCondition = (names: string[]) => `{% ${names.map((name) => `$states.context.Steps.${stepName(name)}.Status = 'SUCCEEDED'`).join(' and ')} %}`

// A sequence machine in data order: each Next a dependency of the state it names, the read of the earlier state's
// status where the later one reads none of its data, so the order stays as it was
const machineToData = (machine: Machine): Machine => {
  const deps = machineDependencies(machine)
  const before = new Map<string, string[]>()
  for (const [name, state] of Object.entries(machine.States)) {
    const next = (state as { Next?: string }).Next
    if (next !== undefined && !deps.get(next)?.data.has(name)) before.set(next, [...(before.get(next) ?? []), name])
  }
  const { StartAt: _, ...rest } = machine
  const States = Object.fromEntries(
    Object.entries(machine.States).map(([name, state]) => {
      const { Next: __, End: ___, ...flowless } = state as State & { Next?: string; End?: boolean }
      const typed = (state.Type === 'Succeed' ? { ...flowless, Type: 'Pass' } : flowless) as State
      const inner = innerMachine(typed)
      const withInner = inner ? { ...typed, ...(typed.Type === 'Map' ? { ItemProcessor: machineToData(inner) } : { Processor: machineToData(inner) }) } : typed
      const after = before.get(name)
      return [name, after ? { ...withInner, Condition: statusCondition(after) } : withInner]
    }),
  )
  return { ...rest, States } as Machine
}

// A data machine in sequence: one chain in an order every dependency keeps, ties by name
const machineToSequence = (machine: Machine): Machine => {
  const deps = machineDependencies(machine)
  const done: string[] = []
  const left = new Set(Object.keys(machine.States))
  while (left.size > 0) {
    const ready = [...left].filter((name) => [...dependsOn(deps.get(name)!)].every((other) => done.includes(other))).sort()
    const next = ready[0] ?? [...left].sort()[0]!
    done.push(next)
    left.delete(next)
  }
  const States = Object.fromEntries(
    done.map((name, index) => {
      const state = machine.States[name]!
      const inner = innerMachine(state)
      const withInner = inner ? { ...state, ...(state.Type === 'Map' ? { ItemProcessor: machineToSequence(inner) } : { Processor: machineToSequence(inner) }) } : state
      if (!flowsOn(state)) return [name, withInner]
      const following = done[index + 1]
      return [name, following === undefined ? { ...withInner, End: true } : { ...withInner, Next: following }]
    }),
  )
  return { ...machine, StartAt: done[0] ?? '', States } as Machine
}

/**
 * The definition in data order: each Next becomes what the state it names runs after, by its data or, where it reads
 * none of it, by a Condition on the earlier state's Status, so the states run in the same order; Succeed becomes Pass.
 * Refused with a Choice, a catcher with Next, a variable two states assign, a loop of Nexts, or a Pass or Succeed
 * without Output that gives on the output of the state before it.
 */
export const toDataOrder = (definition: Definition): Switched => {
  const states = allStates(definition.stateMachine)
  const choice = states.find(([, state]) => state.Type === 'Choice')
  if (choice) return { refused: text('switchChoice', { state: choice[0] }) }
  const caught = states.find(([, state]) => 'Catch' in state && (state.Catch ?? []).some((catcher) => catcher.Next !== undefined))
  if (caught) return { refused: text('switchCatchNext', { state: caught[0] }) }
  const twice = assignedTwice(definition.stateMachine)
  if (twice !== undefined) return { refused: text('switchAssignedTwice', { variable: twice }) }
  const loop = looping(definition.stateMachine)
  if (loop !== undefined) return { refused: text('switchLoop', { state: loop }) }
  const passing = passThrough(definition.stateMachine, true)
  if (passing !== undefined) return { refused: text('switchPassThroughData', { state: passing }) }
  return { definition: { ...definition, order: 'data', stateMachine: { ...machineToData(definition.stateMachine), QueryLanguage: 'JSONata' } as Definition['stateMachine'] } }
}

/**
 * The definition in sequence: its states in one chain in an order every dependency keeps, so parallel states run one
 * after another. Refused with a Condition or a catcher without Next, which sequence order has no place for, or a Pass
 * or Succeed without Output after the first state, which would give the output before it instead of the run's input.
 */
export const toSequenceOrder = (definition: Definition): Switched => {
  const states = allStates(definition.stateMachine)
  const conditioned = states.find(([, state]) => state.Condition !== undefined)
  if (conditioned) return { refused: text('switchCondition', { state: conditioned[0] }) }
  const caught = states.find(([, state]) => 'Catch' in state && (state.Catch ?? []).some((catcher) => catcher.Next === undefined))
  if (caught) return { refused: text('switchCatchNoNext', { state: caught[0] }) }
  const chain = machineToSequence(definition.stateMachine)
  const passing = passThrough(definition.stateMachine, false, chain.StartAt)
  if (passing !== undefined) return { refused: text('switchPassThroughSequence', { state: passing }) }
  return { definition: { ...definition, order: 'sequence', stateMachine: { ...chain, QueryLanguage: 'JSONata' } as Definition['stateMachine'] } }
}

/** The definition switched to the other order. */
export const switchedOrder = (definition: Definition): Switched => (orderOf(definition) === 'data' ? toSequenceOrder(definition) : toDataOrder(definition))
