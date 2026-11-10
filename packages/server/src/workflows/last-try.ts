import type { RunStore, SegmentQueue } from '@protobase/workflows'

const endRun = async <Db>(store: RunStore<Db>, queue: SegmentQueue<Db>, db: Db, runId: string, attempt: number) => {
  await store.update(db, runId, { status: 'failed', error: 'States.Runtime', cause: `The run's segment failed ${attempt} times in a row` })
  const run = await store.load(db, runId)
  if (run?.blockOf) await queue.wake(db, run.blockOf)
}

/**
 * Ends a run whose segment failed on the job's last try, as no segment comes after it, and wakes the run waiting for
 * it when it is a block's run, so that run goes on now rather than when its wait runs out. It then throws the segment's
 * error; when ending the run fails too, that error stays first, beside the failure to end the run.
 */
export const failAfterLastTry = async <Db>(store: RunStore<Db>, queue: SegmentQueue<Db>, db: Db, runId: string, attempt: number, error: unknown): Promise<never> => {
  await endRun(store, queue, db, runId, attempt).catch((failure: unknown) => {
    throw new AggregateError([error, failure], "The run's segment failed on its last try, and ending the run failed too")
  })
  throw error
}
