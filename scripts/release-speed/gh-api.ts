// Calls `gh api`, which prints a failed response as "gh: <message> (HTTP <status>)". GitHub answers a busy moment with a
// 5xx that clears within seconds, so a 5xx is asked again after a short wait, three times at most, and then throws a
// GhServerError; any other failure throws at once.
import { spawnSync } from 'node:child_process'

export type Gh = (args: string[]) => { status: number | null; stdout: string; stderr: string }

const gh: Gh = (args) => spawnSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

// The script runs its calls one after another, so a blocking wait holds nothing else up.
const sleep = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

export const retryDelays = [2_000, 5_000, 10_000]

/** GitHub kept answering with a 5xx after every retry. */
export class GhServerError extends Error {}

/** The parsed JSON of `gh api <path>`, with `run` and `wait` in place of the gh CLI and a blocking sleep in tests. */
export const ghApi = <T>(path: string, run: Gh = gh, wait: (ms: number) => void = sleep): T => {
  for (let attempt = 0; ; attempt += 1) {
    const result = run(['api', path])
    if (result.status === 0) return JSON.parse(result.stdout) as T
    const message = `gh api ${path} failed with status ${result.status}: ${result.stderr.trim()}`
    if (!/\(HTTP 5\d\d\)/.test(result.stderr)) throw new Error(message)
    if (attempt === retryDelays.length) throw new GhServerError(message)
    wait(retryDelays[attempt]!)
  }
}
