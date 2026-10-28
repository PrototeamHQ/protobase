import type { Attempt } from './savepoint-attempt'

/**
 * Evaluates the filters by index, a chunk per query (`read`), and returns the indexes of those Postgres refused. A
 * chunk that fails is halved, and each half tried again, down to the single filters that fail alone, so one bad
 * filter costs about two queries per halving and the others of its chunk are still evaluated. `failedFirst` is a
 * chunk already known to fail.
 */
export const evaluateFilters = async (chunks: readonly number[][], read: (indexes: number[]) => Promise<Attempt<unknown>>, failedFirst?: number[]) => {
  const failed = new Set<number>()

  const narrow = async (indexes: number[]): Promise<void> => {
    if (indexes.length === 1) {
      failed.add(indexes[0]!)
      return
    }
    const middle = Math.ceil(indexes.length / 2)
    await tryChunk(indexes.slice(0, middle))
    await tryChunk(indexes.slice(middle))
  }

  const tryChunk = async (indexes: number[]) => {
    const result = await read(indexes)
    if (!result.ok) await narrow(indexes)
  }

  if (failedFirst && failedFirst.length > 0) await narrow(failedFirst)
  for (const chunk of chunks) await tryChunk(chunk)
  return failed
}
