import { expressionParsed } from './check-reads'
import { stateExpressions } from './expression-fields'
import type { Machine, State } from './types'

/**
 * What a block's steps read from outside it: paths into its input, `[]` for the whole input, and secrets by name, those
 * the Blocks inside it read too.
 */
export type BlockReads = { input: string[][]; secrets: string[] }

// The states whose expressions run in the block's own run: its own, and those of the Maps inside it, but not those of a
// Block inside it, which runs as a run of its own on the input its Arguments give.
const ownStates = (machine: Machine): State[] =>
  Object.values(machine.States).flatMap((state) => [state, ...(state.Type === 'Map' ? ownStates(state.ItemProcessor) : [])])

const within = (path: string[], outer: string[]) => outer.every((key, index) => path[index] === key)

/**
 * What the steps of a block's processor read of what it is given, from their expressions: each read of
 * `$states.context.Execution.Input` as the path of names after it, cut where the path stops being plain names, and
 * each secret by name. A path inside another one read is left out, as its value is part of that one's. A Block inside
 * it reads its input from its own Arguments, which are read here, but the secrets its steps read are the block's too,
 * whose result holds what the inner one made with them.
 */
export const blockReads = (processor: Machine): BlockReads => {
  const input: string[][] = []
  const secrets = new Set<string>()
  for (const state of ownStates(processor)) {
    if (state.Type === 'Block') for (const name of blockReads(state.Processor).secrets) secrets.add(name)
    for (const { source } of stateExpressions(state)) {
      for (const read of expressionParsed(source)?.states ?? []) {
        if (read[0] !== 'context') continue
        if (read[1] === 'Execution' && read[2] === 'Input') input.push(read.slice(3))
        if (read[1] === 'Secrets' && read[2] !== undefined) secrets.add(read[2])
      }
    }
  }
  const sorted = input.sort((a, b) => a.length - b.length)
  const kept: string[][] = []
  for (const path of sorted) if (!kept.some((outer) => within(path, outer))) kept.push(path)
  return { input: kept.sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1)), secrets: [...secrets].sort() }
}
