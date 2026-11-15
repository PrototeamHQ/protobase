import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { customStepOf, type Runner } from '@protobase/workflows'
import type { Deps } from '../../deps'
import { badRequest, notFound } from '../../problem'
import { requestAccess, requireOperation } from '../../request-access'
import type { Session } from '../../types'
import { checkRunInput } from '../input-limits'

/**
 * Starts a custom step's test run as `session` and gives its id: a run of no workflow that runs the version `step`
 * names, such as `custom:ocr:2`, alone, on `input` as its arguments, in the caller's tenant and as the caller. It is a
 * run as any other, so only a caller who may create runs starts one, its input is checked as a run's, its step queues a
 * job for a runner, and the run reads as theirs. A version that is no custom step of their tenant, or one deleted, is a
 * 404.
 */
export const startCustomStepTest = async (deps: () => Deps, schema: string, runner: Runner<Db>, session: Session, step: string, input: Record<string, unknown>) => {
  const found = customStepOf(step)
  if (!found) throw badRequest('invalid-step', 'Name the version to test as custom:<name>:<version>, such as custom:ocr:2')
  checkRunInput(input)
  requireOperation(await requestAccess(deps(), deps().registry.find('workflow_runs')!, session), 'create')
  const tenant = session.tenant === undefined || session.tenant === null ? null : String(session.tenant)
  return deps().db.transaction().execute(async (trx) => {
    const { rows: versions } = await sql`select 1 from ${sql.id(schema, 'custom_step_versions')}
      where coalesce(tenant_id, '') = ${tenant ?? ''} and name = ${found.name} and version = ${found.version} and custom_step_id is not null`.execute(trx)
    if (versions.length === 0) throw notFound(`${step} is no custom step version of yours`)
    const { rows } = await sql<{ id: string }>`insert into ${sql.id(schema, 'runs')} (workflow_id, input, tenant_id, started_by, test_step)
      values (null, ${JSON.stringify(input)}::jsonb, ${tenant}, ${String(session.user.id)}, ${step}) returning id`.execute(trx)
    const id = rows[0]!.id
    await runner.start(trx, id)
    return id
  })
}

/**
 * Which of a tenant's runners are online: holding a claim open now, or running a job whose lease holds; and whether one
 * of them builds images, so a saved version gets built.
 */
export const runnersOnline = async (db: Db, schema: string, tenant: unknown) => {
  const value = tenant === undefined || tenant === null ? '' : String(tenant)
  const now = new Date()
  const { rows } = await sql<{ id: string; builds: boolean }>`select r.id, coalesce(r.state -> 'kinds' @> '["build"]'::jsonb, false) as builds from ${sql.id(schema, 'runners')} r
    where coalesce(r.tenant_id, '') = ${value} and not r.revoked and r.token_hash is not null
      and (r.polling_until > ${now} or exists (select 1 from ${sql.id(schema, 'custom_step_jobs')} j where j.runner_id = r.id and j.status = 'running' and j.lease_until > ${now}))`.execute(db)
  return { ids: rows.map((row) => row.id), builds: rows.some((row) => row.builds) }
}
