/** How the test runner reaches the app: a fetch of the app's own paths, such as the app's `request`. */
export type AppFetch = (path: string, init: RequestInit) => Response | Promise<Response>

/** What the test runner says of itself with each claim. */
export type ClaimState = { platform?: string; kinds?: string[]; labels?: string[]; capacity?: { slots: number }; images?: { step: string; snapshot?: boolean }[]; instances?: { step: string; free: number }[] }

/** A job as a claim gives it. */
export type ClaimedJob = { id: string; step: string; input: Record<string, unknown>; token: string; deadline: string; heartbeat_seconds: number; lease_seconds: number }

/**
 * A runner for the tests that speaks only the runners' HTTP API, as a runner program would: it registers with its
 * one-time token, then claims, heartbeats, logs and completes with its own. It runs nothing itself; the test says what
 * each job gives.
 */
export const testRunner = (fetch: AppFetch) => {
  let token: string | undefined
  const call = (path: string, body: unknown) =>
    Promise.resolve(fetch(`/api/runners/v1${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) }, body: JSON.stringify(body) }))
  const json = async (response: Response) => {
    if (response.status !== 200) throw new Error(`${response.status} ${await response.text()}`)
    return (await response.json()) as Record<string, unknown>
  }
  const state = (given: ClaimState = {}) => ({ platform: 'linux/amd64', kinds: ['container'], labels: [], capacity: { slots: 1 }, images: [], instances: [], ...given })
  return {
    get token() {
      return token
    },
    /** Registers with a one-time token, keeping the runner's own token it gets; the response as it came. */
    register: async (registration: string) => {
      const response = await call('/register', { token: registration, platform: 'linux/amd64', kinds: ['container'] })
      if (response.status === 200) token = ((await response.clone().json()) as { token: string }).token
      return response
    },
    /** One claim, held until a job or its time: the job, or undefined for none. */
    claim: async (given?: ClaimState) => {
      const answered = (await json(await call('/claim', state(given)))) as { order: 'job'; job: ClaimedJob } | { order: 'none' }
      return answered.order === 'job' ? answered.job : undefined
    },
    /** Claims again and again until a claim gives a job, as a runner does. */
    claimJob: async (given?: ClaimState, tries = 10) => {
      for (let tried = 0; tried < tries; tried++) {
        const response = await call('/claim', state(given))
        const answered = (await json(response)) as { order: 'job'; job: ClaimedJob } | { order: 'none' }
        if (answered.order === 'job') return answered.job
      }
      throw new Error(`No job came in ${tries} claims`)
    },
    /** A call as it came, to check a refusal. */
    raw: call,
    heartbeat: async (job: string) => (await json(await call(`/jobs/${job}/heartbeat`, {}))) as { stop: boolean },
    log: async (job: string, lines: string[]) => json(await call(`/jobs/${job}/log`, { lines })),
    complete: (job: string, body: { output: unknown } | { error: string; cause?: string }) => call(`/jobs/${job}/complete`, body),
  }
}
