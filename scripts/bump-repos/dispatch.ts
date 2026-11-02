import type { SpawnSyncReturns } from 'node:child_process'
import { dispatchArgs, type Target } from './targets'

export type Run = (args: string[]) => Pick<SpawnSyncReturns<string>, 'error' | 'status' | 'stderr'>

// Starts the bump of every target through `run`, one after the other, and returns the repositories that could not be
// started: a spawn error, a timeout or a non-zero exit fails that repository alone, and the others are still started.
export const dispatchAll = (targets: Target[], version: string, run: Run) =>
  targets
    .filter((target, index) => {
      const position = `${index + 1} of ${targets.length}`
      const result = run(dispatchArgs(target, version))
      if (!result.error && result.status === 0) {
        console.log(`Started the bump of ${target.repo} (${position}) to ${version}`)
        return false
      }
      const reason = result.error ? `gh did not finish (${(result.error as NodeJS.ErrnoException).code ?? 'error'})` : result.stderr.trim()
      console.error(`Could not start the bump of ${target.repo} (${position}): ${reason}`)
      return true
    })
    .map(({ repo }) => repo)
