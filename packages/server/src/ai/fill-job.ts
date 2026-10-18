import { promptFields } from '@protobase/schema/internal'
import { z } from 'zod'
import { assistantRecords, type ToolRecord } from '../assistant/records'
import type { Deps } from '../deps'
import { defineJob } from '../jobs/define-job'
import { FatalJobError } from '../jobs/run-job'
import { HttpProblem } from '../problem'
import { generateValue } from './generate-value'
import { same, writerSession } from './values'

const payload = z.object({
  resource: z.string(),
  key: z.string(),
  field: z.string(),
  user: z.object({ id: z.union([z.string(), z.number()]), roles: z.array(z.string()) }),
  tenant: z.union([z.string(), z.number()]).optional(),
})

export type FillPayload = z.infer<typeof payload>

// A record deleted since, or out of the writer's reach now, is no longer theirs to fill.
const current = async (read: Promise<ToolRecord>) => {
  try {
    return await read
  } catch (error) {
    if (error instanceof HttpProblem && error.status === 404) return undefined
    if (error instanceof HttpProblem && error.status === 403) throw new FatalJobError(error.message)
    throw error
  }
}

/**
 * The job that fills an AI field (`.ai()`) from its prompt, as the user whose write enqueued it. It writes nothing when
 * the record is gone, when a field the prompt reads changed while the model answered (that change enqueued a newer job),
 * or when the value is the one stored; when every field the prompt reads is empty the field is cleared. A model that
 * fails, or a record changed between the read and the write, is retried.
 */
export const fillJob = (depsOf: () => Deps) =>
  defineJob({
    name: 'ai.fill',
    payload,
    maxAttempts: 5,
    retryDelay: '30 seconds',
    concurrency: 4,
    run: async (job, { signal }) => {
      const deps = depsOf()
      const field = deps.registry.find(job.resource)?.model.fields[job.field]
      if (!field?.ai) throw new FatalJobError(`${job.resource} has no AI field "${job.field}"`)
      const model = deps.ai?.model
      if (!model) throw new Error('AI fields need a model: set PROTOBASE_ASSISTANT_API_KEY')
      // As the writer was when they wrote, with the roles they had, as the change capture's actor is: any authenticator's users work
      const records = assistantRecords(deps, writerSession(job.user, job.tenant))
      const read = await current(records.get(job.resource, job.key))
      if (!read) return
      const value = await generateValue(model, { prompt: field.ai.prompt, record: read.record, field }, signal)
      const now = await current(records.get(job.resource, job.key))
      if (!now || promptFields(field.ai.prompt).some((name) => !same(now.record[name], read.record[name]))) return
      if (same(now.record[job.field] ?? null, value)) return
      try {
        await records.update(job.resource, job.key, { [job.field]: value }, { etag: now.etag })
      } catch (error) {
        if (error instanceof HttpProblem && error.status === 403) throw new FatalJobError(error.message)
        throw error
      }
    },
  })
