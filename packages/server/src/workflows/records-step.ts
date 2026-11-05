import { sql } from 'kysely'
import { StepError, type TaskContext, type TaskHandler } from '@protobase/workflows'
import { assistantRecords, toolEntry, type RecordKeyInput } from '../assistant/records'
import type { BatchOperation } from '../batch/schema'
import type { Deps } from '../deps'
import { issueTicket } from '../files/ticket'
import { HttpProblem } from '../problem'
import { tenantScope } from '../tenant'
import type { Row, Session, TenantValue } from '../types'
import { runFileRef } from './run-files'

/** The roles a user acts with now in a tenant: none for one who is banned, gone or holds no role. */
export type SaverRoles = (user: { id: string; tenant?: TenantValue }) => Promise<string[]>

export type RecordsStepInput = { deps: () => Deps; schema: string; roles: SaverRoles }

// A ticket lives long enough for the write right after it.
const ticketSeconds = 60

/**
 * The session a run's records steps act in: the user who saved the version the run pinned, with the roles they hold
 * now in the run's tenant, so a workflow never does more than its last editor may do today.
 */
const saverSession = async ({ deps, schema, roles }: RecordsStepInput, runId: string): Promise<Session> => {
  const { rows } = await sql<{ saved_by: string | null; tenant_id: string | null }>`select v.saved_by, r.tenant_id from ${sql.id(schema, 'runs')} r
    join ${sql.id(schema, 'versions')} v on v.workflow_id = r.workflow_id and v.version = r.version where r.id = ${runId}`.execute(deps().db)
  const row = rows[0]
  if (!row?.saved_by) throw new StepError('Records.Refused', "The run's version was not saved by a user, so its steps act on no records")
  const tenant = row.tenant_id ?? undefined
  const held = await roles({ id: row.saved_by, ...(tenant !== undefined && { tenant }) })
  if (held.length === 0) throw new StepError('Records.Refused', "The workflow's last editor holds no role here any more, so its steps act on no records")
  return { user: { id: row.saved_by, roles: held }, ...(tenant !== undefined && { tenant, organization: { id: tenant } }) }
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

const text = (value: unknown, name: string) => {
  if (typeof value !== 'string' || value === '') throw new StepError('Records.InvalidArguments', `${name} must be text`)
  return value
}

const keyOf = (value: unknown): RecordKeyInput => {
  if (typeof value === 'string' || typeof value === 'number') return value
  if (Array.isArray(value) && value.every((part) => typeof part === 'string' || typeof part === 'number')) return value
  throw new StepError('Records.InvalidArguments', 'key must be text, a number or a list of them')
}

const rowOf = (value: unknown, name: string): Row => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new StepError('Records.InvalidArguments', `${name} must be an object of field values`)
  return value as Row
}

// A refusal of the API, such as 403 or 404, as the step's error; the API's message names the field or rule.
const refusedAs = (error: unknown): never => {
  if (error instanceof HttpProblem) throw new StepError('Records.Refused', `${error.status} ${error.title}: ${error.detail}`)
  throw error
}

type Operation = 'create' | 'update' | 'get' | 'list'

const run = async (input: RecordsStepInput, operation: Operation, args: Record<string, unknown>, { runId }: TaskContext) => {
  const resource = text(args.resource, 'resource')
  const deps = input.deps()
  const session = await saverSession(input, runId)
  const records = assistantRecords(deps, session)
  if (operation === 'get') return (await records.get(resource, keyOf(args.key))).record
  if (operation === 'update') return (await records.update(resource, keyOf(args.key), await withTickets(deps, session, resource, rowOf(args.data, 'data'), runId))).record
  if (operation === 'list') {
    const page = await records.list(resource, {
      ...(args.filter !== undefined && { filter: text(args.filter, 'filter') }),
      ...(args.order_by !== undefined && { order_by: text(args.order_by, 'order_by') }),
      ...(args.limit !== undefined && { page_size: Number(args.limit) }),
    })
    return { records: page.items.map(({ etag: _, permissions: __, ...record }) => record) }
  }
  // Several records are created in one batch, all or none, so a retry after one fails does not create the others again.
  if (Array.isArray(args.data)) {
    const operations: BatchOperation[] = []
    for (const [index, item] of args.data.entries()) operations.push({ op: 'create', resource, data: await withTickets(deps, session, resource, rowOf(item, `data[${index}]`), runId) })
    const results = await records.batch(operations)
    return results.flatMap((result) => (result.op === 'create' ? [result.record] : []))
  }
  return (await records.create(resource, await withTickets(deps, session, resource, rowOf(args.data, 'data'), runId))).record
}

/**
 * The `app:records.*` steps: `create`, `update`, `get` and `list` through the app's API as the workflow's last editor,
 * so its access rules, tenant scope, validation and write hooks apply as they do to that user's own requests.
 */
export const recordsSteps = (input: RecordsStepInput): Record<`app:records.${Operation}`, TaskHandler> => {
  const step = (operation: Operation): TaskHandler => (args, context) => run(input, operation, rowOf(args ?? {}, 'Arguments'), context).catch(refusedAs)
  // A get or a list only reads, so a run does it again after a crash rather than recording it.
  const reading = (operation: Operation) => Object.assign(step(operation), { reads: () => true })
  return { 'app:records.create': step('create'), 'app:records.update': step('update'), 'app:records.get': reading('get'), 'app:records.list': reading('list') }
}
