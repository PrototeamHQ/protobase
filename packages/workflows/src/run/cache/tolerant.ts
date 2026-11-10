import { limits } from '../../limits'
import type { TaskContext } from '../port'

// The cache is a shortcut, never a reason to fail: a store that fails or is slow leaves the step to run without it.
// The worker's own stop still ends the step.
const late = Symbol('late')
export const tolerant = async <T>(task: Pick<TaskContext, 'log' | 'signal'>, what: string, call: () => Promise<T>): Promise<T | undefined> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<typeof late>((resolve) => (timer = setTimeout(resolve, limits.cacheLookupMs, late)))
  try {
    const result = await Promise.race([call(), timeout])
    if (result !== late) return result
    task.log(`The cache took too long to ${what}; the step ran without it`)
    return
  } catch (error) {
    if (task.signal.aborted) throw error
    task.log(`The cache could not ${what}; the step ran without it`)
    return
  } finally {
    clearTimeout(timer)
  }
}
