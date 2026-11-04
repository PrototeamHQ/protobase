import type { Db } from '@protobase/query'
import { createRunner, type SegmentQueue, type TaskHandlers } from '@protobase/workflows'
import { defineJob } from '../jobs/define-job'
import type { JobDefinition } from '../jobs/job-types'
import { postgresRunStore } from './store'

/** The job that runs one segment of a workflow run. */
export const segmentJobName = 'workflows.segment'

/**
 * The runner on the app's jobs: each segment is a `workflows.segment` job, kept once per run while it waits. Its
 * timeout is above a segment's time plus the longest step's, so a job that times out is a worker that died, and its
 * next try takes the run up from its last saved step.
 */
export const workflowsRunner = (schema: string, tasks: TaskHandlers) => {
  let job: JobDefinition<{ run: string }> | undefined
  const queue: SegmentQueue<Db> = {
    schedule: async (db, run, at) => void (await job!.enqueue(db, { run }, { key: run, ...(at && { runAt: at }) })),
  }
  const runner = createRunner({ store: postgresRunStore(schema), queue, tasks })
  job = defineJob<{ run: string }>({
    name: segmentJobName,
    run: ({ run }, { db, signal }) => runner.segment(db, run, signal),
    maxAttempts: 10,
    retryDelay: '5 seconds',
    timeout: '10 minutes',
    concurrency: 5,
  })
  return { runner, job }
}
