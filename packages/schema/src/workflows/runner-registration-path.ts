/** The name of the runner's id in its registration path. */
export const runnerRegistrationParam = 'runner'

/** The route of a runner's registration under `<systemPath>/workflows/runners`, as the server serves it. */
export const runnerRegistrationRoute = `/:${runnerRegistrationParam}/registration` as const

/** The path that issues a runner's one-time registration token, under the API's system path (`/api`). */
export const runnerRegistrationPath = (systemPath: string, runner: string) => `${systemPath}/workflows/runners/${encodeURIComponent(runner)}/registration`

/**
 * What issuing a runner's registration token answers, once: the `pbr_once_...` token, valid until `expires_at`, the one
 * command that installs a runner with it on a machine, and the address of the runner's calls.
 */
export type RunnerRegistration = { token: string; expires_at: string; command: string; endpoint: string }
