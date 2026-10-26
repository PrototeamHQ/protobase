import type { Db } from '@protobase/query'
import { argumentsSchema, type ArgumentsSpec } from '@protobase/schema'
import { currentJobs } from './current'
import { defineJob } from './define-job'
import type { EnqueueOptions, JobContext, JobDefinition, JobOptions } from './job-types'

/**
 * A job as `protobase.config.ts` declares it, by its name: what it does, its arguments and when it runs. Its run is the
 * default export of `jobs/<name>.ts`, loaded the first time the job runs.
 */
export type JobDeclaration = Omit<JobOptions<unknown>, 'name' | 'payload' | 'run'> & {
  /** What the job does, for the people who read the config and the failed jobs page. */
  description?: string
  /** Its arguments by name, each a field type or a type with options (see `ArgumentSpec`), such as `{ invoiceId: 'bigint' }`. */
  arguments?: ArgumentsSpec
}

/** The default export of `jobs/<name>.ts`: what the job does with its arguments. */
export type JobRun<Payload = Record<string, unknown>> = (payload: Payload, context: JobContext) => Promise<void> | void

/** The job a config declares, whose run `load` gives on its first run. */
export const declaredJob = (name: string, { description: _, arguments: args, ...options }: JobDeclaration, load: () => Promise<JobRun>): JobDefinition => {
  let run: Promise<JobRun> | undefined
  return defineJob<Record<string, unknown>>({
    ...options,
    name,
    ...(args && { payload: argumentsSchema(name, args) as never }),
    run: async (payload, context) => (await (run ??= load()))(payload ?? {}, context),
  })
}

/**
 * Enqueues the job named `name`, which the config declares, in `db`'s own transaction when it is one, and returns its
 * id: what a write hook calls, so the job commits with the write or not at all.
 */
export const enqueueJob = (db: Db, name: string, payload?: Record<string, unknown>, options?: EnqueueOptions) => {
  const runtime = currentJobs()
  const definition = runtime.definition(name)
  if (!definition) throw new Error(`There is no job "${name}": declare it in protobase.config.ts's jobs`)
  return runtime.enqueue(definition, db, payload, options)
}
