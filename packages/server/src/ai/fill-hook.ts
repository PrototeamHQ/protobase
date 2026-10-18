import type { FieldModel } from '@protobase/schema'
import { encodeKey, promptFields } from '@protobase/schema/internal'
import type { Deps } from '../deps'
import { requestAccess, writableFields } from '../request-access'
import type { PipelineHook, Row, WriteEvent } from '../types'
import { aiFields } from './ai-fields'
import type { fillJob } from './fill-job'
import { isEmpty, same, writerSession } from './values'

// A create fills an empty field from fields that hold something; an update refills it when a field the prompt reads
// changed, unless the write changed the field itself: a person's own edit wins, and the job's own write changes only it.
const wantsFill = (event: WriteEvent, field: FieldModel, after: Row) => {
  const reads = promptFields(field.ai!.prompt)
  if (event.operation === 'create') return isEmpty(after[field.name]) && reads.some((name) => !isEmpty(after[name]))
  if (event.operation !== 'update' || !event.before) return false
  const before = event.before
  return reads.some((name) => !same(before[name], after[name])) && same(before[field.name], after[field.name])
}

/**
 * The write hook that enqueues the `ai.fill` job of each AI field a write calls for, in the write's transaction, one
 * waiting job per record and field with the latest writer. The job writes as the writer, so a visitor without a token
 * (a public form) or a writer who may not read what the prompt reads or update the field gets no fill.
 */
export const fillHook = (depsOf: () => Deps, job: ReturnType<typeof fillJob>): PipelineHook => async (event, trx) => {
  const { after } = event
  if (!after || event.anonymous) return
  const wanted = aiFields(event.resource).filter((field) => wantsFill(event, field, after))
  if (wanted.length === 0) return
  const deps = depsOf()
  const entry = deps.registry.find(event.resource.name)!
  const access = await requestAccess(deps, entry, writerSession(event.user, event.tenant))
  const updatable = access.resolved.operations.update ? writableFields(access, 'update') : []
  const key = encodeKey(event.resource.primaryKey.map((name) => after[name] as string | number))
  for (const field of wanted) {
    const allowed = updatable.includes(field.name) && promptFields(field.ai!.prompt).every((name) => Object.hasOwn(access.model.fields, name))
    if (!allowed) continue
    const payload = { resource: event.resource.name, key, field: field.name, user: { id: event.user.id, roles: [...event.user.roles] }, ...(event.tenant !== undefined && { tenant: event.tenant }) }
    await job.enqueue(trx, payload, { key: `ai:${event.resource.name}:${key}:${field.name}`, mode: 'replace' })
  }
}
