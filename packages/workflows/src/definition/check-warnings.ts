import { expressionParsed } from './check-reads'
import { stateExpressions } from './expression-fields'
import { edges } from './graph'
import { innerMachine } from './inner'
import type { Problem } from './problem'
import type { Definition, Machine, State } from './types'

// The states reached from `start` along the edges, without passing through `avoid`, which assigns its variables anew.
const reachedAvoiding = (machine: Machine, start: string, avoid: string) => {
  const seen = new Set<string>()
  const stack = [start]
  while (stack.length > 0) {
    const name = stack.pop()!
    const state = machine.States[name]
    if (seen.has(name) || name === avoid || !state) continue
    seen.add(name)
    stack.push(...edges(state).map((edge) => edge.target))
  }
  return seen
}

// The variables a state reads: its own expressions', and those of the states of a Map inside it, which see its variables.
const readVariables = (state: State): Set<string> => {
  const names = new Set(stateExpressions(state).flatMap(({ source }) => [...(expressionParsed(source)?.variables ?? [])]))
  if (state.Type === 'Map') for (const inner of Object.values(state.ItemProcessor?.States ?? {})) for (const name of readVariables(inner)) names.add(name)
  return names
}

const machineWarnings = (machine: Machine, path: string[]): Problem[] => {
  const where = (name: string) => [...path, name].join('/')
  const warnings: Problem[] = []
  for (const [name, state] of Object.entries(machine.States)) {
    const inner = innerMachine(state)
    if (inner) warnings.push(...machineWarnings(inner, [...path, name]))
    if (state.Type !== 'Block' || state.Next === undefined || !state.Assign) continue
    const assigned = new Set(Object.keys(state.Assign))
    const waits = [...reachedAvoiding(machine, state.Next, name)].filter((other) => machine.States[other]!.Type === 'Wait')
    const warned = new Set<string>()
    for (const wait of waits) {
      const after = machine.States[wait]!
      if (!('Next' in after) || after.Next === undefined) continue
      for (const reader of reachedAvoiding(machine, after.Next, name)) {
        const read = [...readVariables(machine.States[reader]!)].filter((variable) => assigned.has(variable))
        if (read.length === 0 || warned.has(reader)) continue
        warned.add(reader)
        const names = read.map((variable) => `$${variable}`).join(', ')
        warnings.push({ state: where(reader), message: `reads ${names} after the Wait "${wait}", and the Block "${name}" set it before that Wait. If it holds something that expires, such as a signed link, it may have expired by then: set it after the Wait instead. If it holds what the block stored, you can leave it.` })
      }
    }
  }
  return warnings
}

/**
 * What a save goes through with but its author should know, each on the state it concerns: a state that reads, after a
 * Wait, a variable a Block assigned before it, whose value may have expired by then. It reads a draft as it stands, so an
 * editor can show them before the definition can be saved.
 */
export const definitionWarnings = (definition: Definition): Problem[] => machineWarnings(definition.stateMachine, [])
