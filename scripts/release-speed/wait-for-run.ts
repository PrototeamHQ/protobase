// The release workflow's last job starts the report while its own run is still in progress, and only a completed run
// counts, so the report first waits for that run to complete: it asks every `interval` and measures anyway once
// `limit` has passed, so a run that never completes delays the report by the limit at most.
import type { Api } from './github'

export const interval = 15_000
export const limit = 10 * 60_000

/** Waits until run `id` has completed or `limit` has passed, and says whether it completed. */
export const waitForRun = (id: string, get: Api, wait: (ms: number) => void) => {
  if (!/^\d+$/.test(id)) throw new Error(`RELEASE_RUN must be a run id, a number, not ${JSON.stringify(id)}`)
  for (let waited = 0; ; waited += interval) {
    if (get<{ status: string }>(`actions/runs/${id}`).status === 'completed') return true
    if (waited >= limit) return false
    wait(interval)
  }
}
