import type { Problem } from './problem'
import { allStates } from './inner'
import type { Definition, Machine } from './types'

/** Every Task's step type, the ones inside Maps and Blocks too. */
export const resources = (machine: Machine): string[] => allStates(machine).flatMap(([, state]) => (state.Type === 'Task' ? [state.Resource] : []))

/**
 * The connections `<plugin>:<connection>` a definition's trigger and steps sign in with, given the connection each
 * type uses by its id (`connectionOf`).
 */
export const usedConnections = (definition: Definition, connectionOf: Readonly<Record<string, string>>) => {
  const types = [Object.keys(definition.trigger)[0]!, ...resources(definition.stateMachine)]
  return new Set(types.flatMap((type) => (Object.hasOwn(connectionOf, type) ? [connectionOf[type]!] : [])))
}

/** A binding in `connections` that none of the definition's types signs in with. */
export const connectionProblems = (definition: Definition, connectionOf: Readonly<Record<string, string>>): Problem[] => {
  const used = usedConnections(definition, connectionOf)
  return Object.keys(definition.connections ?? {})
    .filter((key) => !used.has(key))
    .map((key) => ({ field: `connections.${key}`, message: `no trigger or step of this workflow signs in with "${key}"; remove it` }))
}
