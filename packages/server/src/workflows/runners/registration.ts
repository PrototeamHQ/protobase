import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { Deps } from '../../deps'
import { fetchReadable } from '../../fetch-readable'
import { deletedRows } from '../../params'
import { HttpProblem, notFound } from '../../problem'
import { requestAccess } from '../../request-access'
import type { Session } from '../../types'
import { mayUpdateWorkflow } from '../may-update-workflow'
import { installCommand, runnerEndpoint, type RunnerApp } from './runner-install'
import { newRegistrationToken, newRunnerToken, registrationMs, registrationPattern, runnerTokenHash } from './runner-tokens'

/** The resource of the runners. */
export const runnersResource = 'workflow_runners'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const missing = () => notFound('No runner with this key that you may change')

/**
 * Gives a runner that never registered a new one-time registration token, valid one hour, as
 * `POST .../workflows/runners/<id>/registration` does: only for a caller who may change that runner in their tenant, as
 * its update access decides, and 404 for anyone else. The token comes back once, with the one command that installs a
 * runner with it on a machine for `app` and the address of the runners' calls, and only its hash is kept; a token
 * issued before stops. A runner that registered, or was revoked, takes none.
 */
export const issueRegistration = async (deps: () => Deps, schema: string, session: Session, id: string, app: RunnerApp) => {
  if (!uuid.test(id)) throw missing()
  const access = await requestAccess(deps(), deps().registry.find(runnersResource)!, session)
  if (!access.resolved.operations.update) throw missing()
  return deps().db.transaction().execute(async (trx) => {
    const found = await fetchReadable(trx, access, [id], deletedRows(access.full, false), { lock: true })
    if (!found || !(await mayUpdateWorkflow(trx, access, id, found.record))) throw missing()
    if (found.record.revoked) throw new HttpProblem(409, 'runner-revoked', 'Conflict', 'This runner is revoked; make a new one to register a machine')
    if (found.record.registered_at) throw new HttpProblem(409, 'runner-registered', 'Conflict', 'This runner registered already; make a new one to register another machine')
    const token = newRegistrationToken()
    const expires = new Date(Date.now() + registrationMs)
    await sql`update ${sql.id(schema, 'runners')} set registration_hash = ${await runnerTokenHash(token)}, registration_expires_at = ${expires} where id = ${id}`.execute(trx)
    return { token, expires_at: expires.toISOString(), command: installCommand(app, token), endpoint: runnerEndpoint(app) }
  })
}

/** Why a registration is refused, each by its name. */
export const registrationRefusals = {
  invalid: () => new HttpProblem(401, 'invalid-registration-token', 'InvalidRegistrationToken', 'This is no registration token of a runner of this app'),
  used: () => new HttpProblem(409, 'registration-token-used', 'RegistrationTokenUsed', 'This registration token was used already; issue a new runner to register another machine'),
  expired: () => new HttpProblem(410, 'registration-token-expired', 'RegistrationTokenExpired', 'This registration token is more than an hour old; issue a new one'),
}

type Registered = { runner: { id: string; name: string; labels: unknown; tenant: string | null }; token: string }

/**
 * Exchanges a runner's one-time registration token for its own token, once: the runner keeps the platform and kinds
 * it gives, and only the new token's hash is kept; the answer names its tenant, which the runner keeps its images apart
 * by. A token used already, or more than an hour old, is refused by name; so is one of a revoked or deleted runner, as
 * no token.
 */
export const register = async (db: Db, schema: string, given: { token: string; platform: string; kinds: string[] }): Promise<Registered> => {
  if (!registrationPattern.test(given.token)) throw registrationRefusals.invalid()
  const hash = await runnerTokenHash(given.token)
  return db.transaction().execute(async (trx) => {
    const { rows } = await sql<{ id: string; name: string; labels: unknown; tenant_id: string | null; revoked: boolean; registered_at: Date | null; registration_expires_at: Date }>`select id, name, labels, tenant_id, revoked, registered_at, registration_expires_at
      from ${sql.id(schema, 'runners')} where registration_hash = ${hash} for update`.execute(trx)
    const runner = rows[0]
    if (!runner || runner.revoked) throw registrationRefusals.invalid()
    if (runner.registered_at) throw registrationRefusals.used()
    if (runner.registration_expires_at.getTime() <= Date.now()) throw registrationRefusals.expired()
    const token = newRunnerToken()
    await sql`update ${sql.id(schema, 'runners')} set token_hash = ${await runnerTokenHash(token)}, registered_at = now(), platform = ${given.platform}, kinds = ${JSON.stringify(given.kinds)}::jsonb
      where id = ${runner.id}`.execute(trx)
    return { runner: { id: runner.id, name: runner.name, labels: runner.labels, tenant: runner.tenant_id }, token }
  })
}
