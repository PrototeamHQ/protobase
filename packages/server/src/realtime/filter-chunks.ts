import { filterParameters, type FilterCondition } from './change-filter'

/**
 * How many filters one query evaluates: one column each, well under Postgres's 1664 target-list entries with the key
 * columns and records beside them, and their bind parameters under the protocol's 65535 with the key list's one.
 */
export const filterChunkLimits = { columns: 1000, parameters: 60_000 }

/**
 * The filters split, in order, into runs of indexes that each fit one query. A filter that alone takes more
 * parameters than one query may hold throws: joins refuse it first (`fitsOneQuery`).
 */
export const filterChunks = (filters: readonly FilterCondition[][], limits = filterChunkLimits) => {
  const chunks: number[][] = []
  let current: number[] = []
  let parameters = 0
  filters.forEach((conditions, index) => {
    const needed = filterParameters(conditions)
    if (needed > limits.parameters) throw new Error(`A filter of ${needed} parameters does not fit one query`)
    if (current.length === limits.columns || parameters + needed > limits.parameters) {
      chunks.push(current)
      current = []
      parameters = 0
    }
    current.push(index)
    parameters += needed
  })
  return current.length > 0 ? [...chunks, current] : chunks
}

/** Whether a filter fits one query, so that a group's check can evaluate it. */
export const fitsOneQuery = (conditions: readonly FilterCondition[]) => filterParameters(conditions) <= filterChunkLimits.parameters
