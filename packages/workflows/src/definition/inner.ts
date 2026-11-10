import type { Definition, Machine, State } from './types'

/** The steps a state holds: a Map's item processor or a Block's processor; none for any other state. */
export const innerMachine = (state: State | undefined): Machine | undefined => {
  if (state?.Type === 'Map') return state.ItemProcessor
  if (state?.Type === 'Block') return state.Processor
  return
}

/** Every state of a machine with its name, the ones inside Maps and Blocks too, outer ones first. */
export const allStates = (machine: Machine): [string, State][] =>
  Object.entries(machine.States).flatMap(([name, state]) => {
    const inner = innerMachine(state)
    return [[name, state] as [string, State], ...(inner ? allStates(inner) : [])]
  })

/** The Block named `name` anywhere in a machine; names are unique across the document. */
export const findBlock = (machine: Machine, name: string) => {
  const found = allStates(machine).find(([other]) => other === name)?.[1]
  return found?.Type === 'Block' ? found : undefined
}

/** The definition a block's run runs: the Block `name`'s processor as its state machine; undefined when it has no such Block. */
export const blockDefinition = (definition: Definition, name: string): Definition | undefined => {
  const block = findBlock(definition.stateMachine, name)
  return block && { ...definition, stateMachine: { ...block.Processor, QueryLanguage: 'JSONata' } }
}
