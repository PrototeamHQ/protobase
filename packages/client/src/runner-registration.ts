import { runnerRegistrationPath, type RunnerRegistration } from '@protobase/schema/internal'
import type { Transport } from './transport'

export type { RunnerRegistration } from '@protobase/schema/internal'

/**
 * Issues a runner that never registered a new one-time registration token (`POST /api/workflows/runners/<id>/registration`),
 * valid one hour, which replaces the one issued before: `{ token, expires_at, command, endpoint }`, shown this once, with
 * the one command that installs the runner on a machine. Rejects with an `ApiError` for a caller who may not change the
 * runner (404), or a runner that registered or was revoked (409).
 */
export const runnerRegistrationClient = (send: Transport) => async (runner: string): Promise<RunnerRegistration> =>
  (await send({ method: 'POST', path: runnerRegistrationPath('', runner), system: true })).json() as Promise<RunnerRegistration>
