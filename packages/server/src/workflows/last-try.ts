import type { RunStore, SegmentQueue } from '@protobase/workflows'

/**
 * Ends a run whose segment failed on the job's last try, as no segment comes after it, and wakes the run waiting for
 * it when it is a block's run, so that run goes on now rather than when its wait runs out.
 */
export const failAfterLastTry = async <Db>(store: RunStore<Db>, queue: SegmentQueue<Db>, db: Db, runId: string, attempt: number) => {
  await store.update(db, runId, { status: 'failed', error: 'States.Runtime', cause: `The run's segment failed ${attempt} times in a row` })
  const run = await store.load(db, runId)
  if (run?.blockOf) await queue.wake(db, run.blockOf)
}
