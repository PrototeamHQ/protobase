import { sql } from 'kysely'
import { StepError } from '@protobase/workflows'
import type { PluginRecords } from '@protobase/workflows/plugin'
import { assistantRecords, toolEntry, type RecordKeyInput } from '../assistant/records'
import { runBatch } from '../batch/run-batch'
import type { BatchOperation } from '../batch/schema'
import type { Deps } from '../deps'
import { issueTicket } from '../files/ticket'
import { HttpProblem } from '../problem'
import { tenantScope } from '../tenant'
import type { Row, Session, TenantValue } from '../types'
import { effectsStore } from './effects-store'
import { runFileRef } from './run-files'

/** The roles a user acts with now in a tenant: none for one who is banned, gone or holds no role. */
export type SaverRoles = (user: { id: string; tenant?: TenantValue }) => Promise<string[]>

export type RecordsInput = { deps: () => Deps; schema: string; roles: SaverRoles }

// A ticket lives long enough for the write right after it.
const ticketSeconds = 60

/**
 * The session of the user who saved a version, with the roles they hold now in its tenant, so a workflow never does
 * more than its last editor may do today.
 */
export const saverSession = async (roles: SaverRoles, savedBy: string | null, tenant: string | undefined): Promise<Session> => {
  if (!savedBy) throw new StepError('Records.Refused', "The run's version was not saved by a user, so its steps act on no records")
  const held = await roles({ id: savedBy, ...(tenant !== undefined && { tenant }) })
  if (held.length === 0) throw new StepError('Records.Refused', "The workflow's last editor holds no role here any more, so its steps act on no records")
  return { user: { id: savedBy, roles: held }, ...(tenant !== undefined && { tenant, organization: { id: tenant } }) }
}

/** The session a run's records steps act in: that of the user who saved the version the run pinned, in the run's tenant. */
export const runSession = async ({ deps, schema, roles }: RecordsInput, runId: string) => {
  const { rows } = await sql<{ saved_by: string | null; tenant_id: string | null }>`select v.saved_by, r.tenant_id from ${sql.id(schema, 'runs')} r
    join ${sql.id(schema, 'versions')} v on v.workflow_id = r.workflow_id and v.version = r.version where r.id = ${runId}`.execute(deps().db)
  return saverSession(roles, rows[0]?.saved_by ?? null, rows[0]?.tenant_id ?? undefined)
}

// Field values as the API takes them: a number for a decimal field as its text, and a file value of the run's own in a
// file field as the upload ticket the write takes for that field and user.
const withTickets = async (deps: Deps, session: Session, resource: string, data: Row, runId: string): Promise<Row> => {
  const entry = toolEntry(deps, resource)
  const result = { ...data }
  for (const [name, value] of Object.entries(data)) {
    const field = entry.model.fields[name]
    if (field?.type === 'decimal' && typeof value === 'number') result[name] = String(value)
    if (!field?.file || value === null || typeof value !== 'object') continue
    if (!deps.files) throw new StepError('States.TaskFailed', 'The app keeps no files')
    const ref = runFileRef(runId, value, `data.${name}`)
    const scope = { tenant: String(tenantScope(entry, session)?.tenantValue ?? ''), resource: entry.name, field: name, user: String(session.user.id) }
    result[name] = await issueTicket(deps.files.signer, { provider: ref.provider, path: ref.path, name: ref.name, ...(ref.size !== undefined && { size: ref.size }) }, {}, scope, Math.floor(Date.now() / 1000) + ticketSeconds)
  }
  return result
}

// A refusal of the API, such as 403 or 404, as the step's error; the API's message names the field or rule.
const refusedAs = (error: unknown): never => {
  if (error instanceof HttpProblem) throw new StepError('Records.Refused', `${error.status} ${error.title}: ${error.detail}`)
  throw error
}

/**
 * The plugin context's `records` for one try of a step: the app's API as the user who saved the version the run runs, so
 * its access rules, tenant scope, validation and write hooks apply as they do to that user's own requests. A file value
 * of the run's own in a file field is written as the upload ticket the write takes. Each create keeps the step's
 * idempotency key and its place among the step's creates with its records, so a retry of the step after they committed,
 * such as after a crash before the step was saved, creates none again and returns them.
 */
export const pluginRecords = (input: RecordsInput, runId: string, idempotencyKey: string): PluginRecords => {
  const open = async () => {
    const deps = input.deps()
    const session = await runSession(input, runId)
    return { deps, session, records: assistantRecords(deps, session) }
  }
  const guarded = <T>(work: () => Promise<T>) => work().catch(refusedAs)
  let creates = 0
  // Several records are created in one batch, all or none, so a retry after one fails does not create the others again;
  // one record is a batch of one.
  const createAll = async (resource: string, data: Row[]) => {
    const key = `${idempotencyKey}:${creates++}`
    const deps = input.deps()
    const session = await runSession(input, runId)
    const operations: BatchOperation[] = []
    for (const item of data) operations.push({ op: 'create', resource, data: await withTickets(deps, session, resource, item, runId) })
    const results = await runBatch(deps, session, operations, { key, store: effectsStore(input.schema, runId) })
    return results.flatMap((result) => (result.op === 'create' ? [result.record] : []))
  }
  return {
    create: (resource, data) => guarded(async () => (await createAll(resource, [data]))[0]!),
    createMany: (resource, data) => guarded(() => createAll(resource, data)),
    update: (resource, key, data) => guarded(async () => {
      const { deps, session, records } = await open()
      return (await records.update(resource, key as RecordKeyInput, await withTickets(deps, session, resource, data, runId))).record
    }),
    get: (resource, key) => guarded(async () => (await (await open()).records.get(resource, key as RecordKeyInput)).record),
    list: (resource, query) => guarded(async () => {
      const page = await (await open()).records.list(resource, { ...(query.filter !== undefined && { filter: query.filter }), ...(query.order_by !== undefined && { order_by: query.order_by }), ...(query.limit !== undefined && { page_size: query.limit }) })
      return page.items.map(({ etag: _, permissions: __, ...record }) => record)
    }),
  }
}
