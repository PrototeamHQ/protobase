import { limits, nestingDepth } from '@protobase/workflows'
import { triggerStateBytes } from '../schema-sql'

/** The most items one poll or one webhook call may start runs for. */
export const itemCeiling = 100

/** The most characters of a run's key, as the API takes it. */
export const runKeyLength = 200

const jsonBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value ?? null)).length

/** What is wrong with one item's data as a run's input, as the run's own limits say. */
const inputProblem = (data: unknown) => {
  if (nestingDepth(data, limits.inputDepth) > limits.inputDepth) return `nests deeper than ${limits.inputDepth} levels`
  if (jsonBytes(data) > limits.inputBytes) return `is over ${limits.inputBytes / 1024 / 1024} MiB as JSON`
  return
}

/** What is wrong with the items a plugin gave, each needing a key when `keyed`; `undefined` when they all fit. */
export const itemsProblem = (items: unknown, most: number, keyed: boolean) => {
  if (!Array.isArray(items)) return 'gave no items array'
  if (items.length > most) return `gave ${items.length} items, more than its limit of ${most}`
  for (const [index, item] of items.entries()) {
    const { key, data } = (item ?? {}) as { key?: unknown; data?: unknown }
    const needsKey = keyed || key !== undefined
    if (needsKey && (typeof key !== 'string' || key.length === 0 || key.length > runKeyLength)) return `item ${index} has no key of 1 to ${runKeyLength} characters`
    const problem = inputProblem(data)
    if (problem) return `item ${index}'s data ${problem}`
  }
  return
}

/** What is wrong with a subscription's state a webhook plugin gave: over 64 KiB as JSON. */
export const stateProblem = (state: unknown) => (jsonBytes(state) > triggerStateBytes ? `gave a state over ${triggerStateBytes / 1024} KiB as JSON` : undefined)

/** What is wrong with a poll's result: its items, and its cursor and store over 64 KiB as JSON. */
export const pollProblem = (result: unknown, limit: number) => {
  if (typeof result !== 'object' || result === null) return 'gave no result'
  const { items, cursor, store } = result as { items?: unknown; cursor?: unknown; store?: unknown }
  const problem = itemsProblem(items, limit, true)
  if (problem) return problem
  if (jsonBytes(cursor) > triggerStateBytes) return `gave a cursor over ${triggerStateBytes / 1024} KiB as JSON`
  if (store !== undefined && jsonBytes(store) > triggerStateBytes) return `gave a store over ${triggerStateBytes / 1024} KiB as JSON`
  return
}
