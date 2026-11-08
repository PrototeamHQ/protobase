import type { Db } from '@protobase/query'
import { createRunner, type SegmentQueue, type StepCacheStore, type TaskHandlers, type TraceMode, type TraceSink } from '@protobase/workflows'
import { defineJob } from '../jobs/define-job'
import type { JobContext, JobDefinition } from '../jobs/job-types'
import { postgresRunStore } from './store'

/** The job that runs one segment of a workflow run. */
export const segmentJobName = 'workflows.segment'

export type WorkflowsRunnerInput = {
  schema: string
  /** The step types of a segment, given the job that runs it. */
  tasks: (job: JobContext) => TaskHandlers
  secrets: Readonly<Record<string, string>>
  /** Where step types that cache keep their results. */
  cache?: StepCacheStore
  trace: TraceSink
  /** The trace a run keeps when neither it nor its workflow says. */
  traceMode: TraceMode
}

/**
 * The runner on the app's jobs: each segment is a `workflows.segment` job, kept once per run while it waits. Its
 * timeout is above a segment's time plus the longest step's, so a job that times out is a worker that died, and its
 * next try takes the run up from its last saved step.
 */
export const workflowsRunner = ({ schema, tasks, secrets, cache, trace, traceMode }: WorkflowsRunnerInput) => {
  let job: JobDefinition<{ run: string }> | undefined
  const store = postgresRunStore(schema)
  const queue: SegmentQueue<Db> = {
    schedule: async (db, run, at) => void (await job!.enqueue(db, { run }, { key: run, ...(at && { runAt: at }) })),
  }
  const runner = createRunner({ store, queue, tasks: {}, secrets, trace, traceMode })
  job = defineJob<{ run: string }>({
    name: segmentJobName,
    run: ({ run }, context) =>
      createRunner({ store, queue, tasks: tasks(context), secrets, trace, traceMode, ...(cache && { cache }) })
        .segment(context.db, run, context.signal)
        .catch(async (error: unknown) => {
          // No segment comes after the job's last try, so that try ends the run rather than leaving it running.
          if (context.job.attempt >= context.job.maxAttempts) await store.update(context.db, run, { status: 'failed', error: 'States.Runtime', cause: `The run's segment failed ${context.job.attempt} times in a row` })
          throw error
        }),
    maxAttempts: 10,
    retryDelay: '5 seconds',
    timeout: '10 minutes',
    concurrency: 5,
  })
  return { runner, job }
}
