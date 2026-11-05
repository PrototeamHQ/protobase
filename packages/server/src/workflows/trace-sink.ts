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
  /** Names the run's whole trace on the run, as its `trace_file`. */
  kept: (runId: string, file: string) => Promise<void>
  report: (error: unknown) => void
}

/**
 * The trace of runs as JSON lines in the private file provider, one step a line with its input, output, logs and
 * timing. Each segment's steps are a part of their own, written in the background; the segment that ends the run joins
 * the parts into `trace.jsonl`, which the run's `trace_file` then names, or drops them when only a failing run keeps
 * one. A trace that cannot be written goes to the app's error report, and the run goes on.
 */
export const traceSink = ({ files, kept, report }: TraceSinkInput): TraceSink => {
  const keep = async (runId: string, steps: readonly StepRecord[], dropped: boolean, ended: boolean) => {
    const store = privateRunStore(files())
    if (!store) throw new Error('Workflows keep run traces in the "private" file provider, which the app does not have or serves to anyone; set workflows.trace to "none" to keep none')
    if (!dropped && steps.length > 0) await store.put(`${traceParts(runId)}${new Date().toISOString()}-${crypto.randomUUID()}.jsonl`, new Blob([lines(steps)]).stream())
    if (!ended) return
    const parts = await store.list(traceParts(runId))
    if (!dropped) {
      const texts = await Promise.all(parts.map(async (part) => new Response(await store.read(part.path)).text()))
      const whole = new Blob(texts)
      const { size } = await store.put(traceFile(runId), whole.stream())
      await kept(runId, formatUri({ provider: 'private', path: traceFile(runId), name: 'trace.jsonl', size }))
    }
    await Promise.all(parts.map((part) => store.delete(part.path)))
  }
  return {
    write: (runId, steps, { mode, ended }) => {
      if (mode === 'none') return
      void keep(runId, steps, mode === 'failed' && ended === 'succeeded', ended !== undefined).catch(report)
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
