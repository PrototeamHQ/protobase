import type { StepRecord, TraceSink } from '@protobase/workflows'
import type { FilesRuntime } from '../files/runtime'
import { formatUri } from '../files/uri'
import { privateRunStore, runFolder } from './run-files'

/** Where a run's trace is kept: each segment's part under `trace/` while it runs, then the whole in `trace.jsonl`. */
export const traceParts = (runId: string) => `${runFolder(runId)}trace/`
export const traceFile = (runId: string) => `${runFolder(runId)}trace.jsonl`

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
  // A part is named by when it was kept, then by how many parts of the run were there before it, whichever worker kept
  // them, so two parts kept in the same millisecond still read in the order they were written.
  const partName = (before: number) => `${new Date().toISOString()}-${String(before).padStart(12, '0')}-${crypto.randomUUID()}.jsonl`
  const keep = async (runId: string, steps: readonly StepRecord[], dropped: boolean, ended: boolean) => {
    const store = privateRunStore(files())
    if (!store) throw new Error('Workflows keep run traces in the "private" file provider, which the app does not have or serves to anyone; set workflows.trace to "none" to keep none')
    if (!dropped && steps.length > 0) {
      const before = await store.list(traceParts(runId))
      await store.put(`${traceParts(runId)}${partName(before.length)}`, new Blob([lines(steps)]).stream())
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
