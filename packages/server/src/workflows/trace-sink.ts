import type { StepRecord, TraceSink } from '@protobase/workflows'
import type { FilesRuntime } from '../files/runtime'
import { formatUri } from '../files/uri'
import { privateRunStore, runFolder } from './run-files'

/** Where a run's trace is kept: each segment's part under `trace/` while it runs, then the whole in `trace.jsonl`. */
export const traceParts = (runId: string) => `${runFolder(runId)}trace/`
export const traceFile = (runId: string) => `${runFolder(runId)}trace.jsonl`
/** The number the run's next part takes, kept outside `trace/` so a join never reads it as a part. */
const traceNext = (runId: string) => `${runFolder(runId)}trace-next`

const lines = (steps: readonly StepRecord[]) => steps.map((step) => `${JSON.stringify(step)}\n`).join('')

export type TraceSinkInput = {
  files: () => FilesRuntime | undefined
  /**
   * Runs `join` while no other worker joins the same run's trace, as a segment retried while its try before is still
   * joining would: `join` gets `kept`, which names the run's whole trace on the run, as its `trace_file`.
   */
  joining: (runId: string, join: (kept: (file: string) => Promise<void>) => Promise<void>) => Promise<void>
  report: (error: unknown) => void
}

/**
 * The trace of runs as JSON lines in the private file provider, one step a line with its input, output, logs and
 * timing. A segment's steps are parts of their own, each written before a checkpoint after them and before the run goes
 * on; the segment that ends the run joins the parts into `trace.jsonl`, which the run's `trace_file` then names, or
 * drops them when only a failing run keeps one. A trace that cannot be written goes to the app's error report, and the run goes on. A replay reads the trace of
 * the run it replays through `read`.
 */
export const traceSink = ({ files, joining, report }: TraceSinkInput): TraceSink => {
  // A part is named by the run's next number, whichever worker keeps it, so the parts read in the order they were
  // written. One run writes one part at a time, since the runner awaits `write` before it saves the checkpoint after
  // it, so reading the number and putting the next one needs no lock. The number goes up before the part is put: a
  // write that fails leaves a gap, never a number taken twice. The join keeps the number with the run's other files, so
  // a part a retry writes after a join still sorts after every part before it. Parts named by their time, as before,
  // are not ordered among these: before 1.0 a run that spans the upgrade may read its trace out of order.
  const nextPart = async (store: NonNullable<ReturnType<typeof privateRunStore>>, runId: string) => {
    const kept = await store.read(traceNext(runId))
    const next = kept ? Number(await new Response(kept).text()) : 0
    await store.put(traceNext(runId), new Blob([String(next + 1)]).stream())
    return `${String(next).padStart(12, '0')}-${crypto.randomUUID()}.jsonl`
  }
  const keep = async (runId: string, steps: readonly StepRecord[], dropped: boolean, ended: boolean) => {
    const store = privateRunStore(files())
    if (!store) throw new Error('Workflows keep run traces in the "private" file provider, which the app does not have or serves to anyone; set workflows.trace to "none" to keep none')
    if (!dropped && steps.length > 0) {
      await store.put(`${traceParts(runId)}${await nextPart(store, runId)}`, new Blob([lines(steps)]).stream())
    }
    if (!ended) return
    await joining(runId, async (kept) => {
      const parts = await store.list(traceParts(runId))
      if (!dropped) {
        // A segment that ended the run once already, before a crash stopped it from marking the run ended, joined the
        // parts before it: its join is kept ahead of the parts since.
        const earlier = await store.read(traceFile(runId))
        const texts = await Promise.all(parts.map(async (part) => new Response(await store.read(part.path)).text()))
        const whole = new Blob([...(earlier ? [await new Response(earlier).text()] : []), ...texts])
        const { size } = await store.put(traceFile(runId), whole.stream())
        await kept(formatUri({ provider: 'private', path: traceFile(runId), name: 'trace.jsonl', size }))
      }
      await Promise.all(parts.map((part) => store.delete(part.path)))
      // A dropped trace leaves no number behind: a retry of the segment that ended the run drops its steps too, and
      // one that ends it failed instead keeps only parts written since, which the number orders from 0 again.
      if (dropped) await store.delete(traceNext(runId))
    })
  }
  return {
    write: async (runId, steps, { mode, ended }) => {
      if (mode === 'none') return
      await keep(runId, steps, mode === 'failed' && ended === 'succeeded', ended !== undefined).catch(report)
    },
    read: async (runId) => {
      const steps = await readTrace(files(), runId)
      return steps.length > 0 ? (steps as unknown as StepRecord[]) : undefined
    },
  }
}

/**
 * The steps a run's trace holds so far, in the order they ran: its whole trace once it ended, else the parts of its
 * segments; none when it keeps no trace or the app keeps no private files.
 */
export const readTrace = async (files: FilesRuntime | undefined, runId: string): Promise<Record<string, unknown>[]> => {
  const store = privateRunStore(files)
  if (!store) return []
  const whole = await store.read(traceFile(runId))
  const texts = whole ? [await new Response(whole).text()] : await Promise.all((await store.list(traceParts(runId))).map(async (part) => new Response(await store.read(part.path)).text()))
  return texts.flatMap((text) => text.split('\n').filter((line) => line !== '').map((line) => JSON.parse(line) as Record<string, unknown>))
}
