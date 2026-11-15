import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { buildStatuses, customStepOf, type BuildReport } from '@protobase/workflows'
import { notFound } from '../../problem'
import type { Runner } from './runner-jobs'

/** The most of a build's log a build keeps: its end, where a failure says why. */
export const buildLogChars = 10_000

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** A build report's body, `{ step, status, digest?, log? }`, or why it is not one. */
export const buildReportOf = (body: unknown): BuildReport | { problem: string } => {
  if (!isObject(body) || typeof body.step !== 'string' || !customStepOf(body.step)) return { problem: 'Send { step, status }, step the custom step version built, such as "custom:ocr:4"' }
  if (!buildStatuses.includes(body.status as BuildReport['status'])) return { problem: `status is one of ${buildStatuses.join(', ')}` }
  if (body.digest !== undefined && (typeof body.digest !== 'string' || body.digest.length > 200)) return { problem: 'digest is the image\'s digest, such as "sha256:..."' }
  if (body.log !== undefined && typeof body.log !== 'string') return { problem: 'log is the end of the build\'s log, as text' }
  return { step: body.step, status: body.status as BuildReport['status'], ...(body.digest !== undefined && { digest: body.digest as string }), ...(body.log !== undefined && { log: body.log as string }) }
}

/**
 * Keeps a runner's build of a version of its tenant's custom step as it reports it: its start takes up the build that
 * `prepare` left under way for it, or begins one, and its end, ready or failed, ends the runner's latest build of that
 * version under way, or is kept as one that ended. Its log keeps its last `buildLogChars` characters. Answers the build's id.
 */
export const reportBuild = (db: Db, schema: string, runner: Runner, report: BuildReport) =>
  db.transaction().execute(async (trx) => {
    const builds = sql.id(schema, 'custom_step_builds')
    const { name, version } = customStepOf(report.step)!
    const { rows: versions } = await sql<{ id: string }>`select id from ${sql.id(schema, 'custom_step_versions')}
      where coalesce(tenant_id, '') = ${runner.tenant_id ?? ''} and name = ${name} and version = ${version}`.execute(trx)
    const found = versions[0]
    if (!found) throw notFound(`${report.step} is no custom step version of this runner's tenant`)
    const log = report.log === undefined ? null : report.log.slice(-buildLogChars)
    const ended = report.status !== 'building'
    const { rows: open } = await sql<{ id: string }>`select id from ${builds} where runner_id = ${runner.id} and version_id = ${found.id} and status = 'building'
      order by started_at desc limit 1 for update`.execute(trx)
    if (open[0]) {
      await sql`update ${builds} set status = ${report.status}, digest = ${report.digest ?? null}, log = ${log},
        ${ended ? sql`finished_at = now()` : sql`started_at = now()`} where id = ${open[0].id}`.execute(trx)
      return { id: open[0].id }
    }
    const { rows } = await sql<{ id: string }>`insert into ${builds} (runner_id, version_id, step, status, digest, log, finished_at, tenant_id)
      values (${runner.id}, ${found.id}, ${report.step}, ${report.status}, ${report.digest ?? null}, ${log}, ${ended ? sql`now()` : sql`null`}, ${runner.tenant_id}) returning id`.execute(trx)
    return { id: rows[0]!.id }
  })
