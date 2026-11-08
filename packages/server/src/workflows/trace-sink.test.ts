import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StepRecord } from '@protobase/workflows'
import { localFiles } from '../files/local-files'
import type { FilesRuntime } from '../files/runtime'
import { tempDir } from '../files/testing/temp-dir'
import { readTrace, traceSink, type TraceSinkInput } from './trace-sink'

const step = (state: string): StepRecord => ({ scope: '', seq: 0, state, type: 'Task', status: 'succeeded', attempt: 1, input: { n: 1 }, output: 'ok', next: null, logs: [], startedAt: new Date(0), finishedAt: new Date(0), recorded: false })

describe('traceSink', () => {
  let folder: Awaited<ReturnType<typeof tempDir>>
  let files: FilesRuntime
  let named: [string, string][]
  // One join at a time, as the run's advisory lock keeps them, counting the joins that wait for the one before.
  let joined = Promise.resolve()
  let waiting = 0
  const joining: TraceSinkInput['joining'] = (runId, join) => {
    waiting++
    const next = joined.then(() => {
      waiting--
      return join(async (file) => void named.push([runId, file]))
    })
    joined = next.catch(() => {})
    return next
  }
  beforeEach(async () => {
    folder = await tempDir()
    files = { providers: { private: localFiles({ dir: folder.dir }) } } as unknown as FilesRuntime
    named = []
  })
  afterEach(() => folder.remove())

  it("writes each segment's steps as a part, and joins them into the run's trace when it ends", async () => {
    const sink = traceSink({ files: () => files, joining, report: (error) => { throw error } })
    await sink.write('r1', [step('A')], { mode: 'all' })
    expect((await readTrace(files, 'r1')).map((line) => line.state)).toEqual(['A'])
    await sink.write('r1', [step('B')], { mode: 'all', ended: 'succeeded' })
    expect(await files.providers.private!.store.list('workflows/r1/trace/')).toEqual([])
    expect(await readTrace(files, 'r1')).toEqual([expect.objectContaining({ state: 'A', input: { n: 1 } }), expect.objectContaining({ state: 'B' })])
    expect(named).toEqual([['r1', expect.stringMatching(/^private:workflows\/r1\/trace\.jsonl\?name=trace\.jsonl&size=\d+$/)]])
  })

  it('keeps the steps an ending segment joined when a crash makes that segment run and end again', async () => {
    const sink = traceSink({ files: () => files, joining, report: (error) => { throw error } })
    await sink.write('r5', [step('A')], { mode: 'all' })
    await sink.write('r5', [step('B')], { mode: 'all', ended: 'succeeded' })
    await sink.write('r5', [step('B')], { mode: 'all', ended: 'succeeded' })
    expect((await readTrace(files, 'r5')).map((line) => line.state)).toEqual(['A', 'B', 'B'])
  })

  it('keeps every step when a retried segment ends the run while the try before still joins its trace', async () => {
    const store = files.providers.private!.store
    // The first join reads its parts, then waits before it writes them joined, as a worker stuck past its job's timeout does.
    let resume = () => {}
    const put = store.put.bind(store)
    const putJoined = vi.spyOn(store, 'put').mockImplementation(async (path, body) => {
      if (path.endsWith('trace.jsonl') && putJoined.mock.calls.filter(([called]) => called.endsWith('trace.jsonl')).length === 1) await new Promise<void>((resolve) => (resume = resolve))
      return put(path, body)
    })
    const sink = traceSink({ files: () => files, joining, report: (error) => { throw error } })
    await sink.write('r6', [step('A')], { mode: 'all' })
    const first = sink.write('r6', [step('B')], { mode: 'all', ended: 'succeeded' })
    await vi.waitFor(() => expect(putJoined).toHaveBeenCalledWith('workflows/r6/trace.jsonl', expect.anything()))
    let retriedDone = false
    const retried = sink.write('r6', [step('C')], { mode: 'all', ended: 'succeeded' }).then(() => void (retriedDone = true))
    // The first goes on once the retried join is done, or waits for it.
    await vi.waitFor(() => expect(retriedDone || waiting > 0).toBe(true))
    resume()
    await Promise.all([first, retried])
    expect((await readTrace(files, 'r6')).map((line) => line.state)).toEqual(['A', 'B', 'C'])
    expect(await store.list('workflows/r6/trace/')).toEqual([])
  })

  it('keeps no trace of a run that succeeds when only failing runs keep one, and none at all with none', async () => {
    const sink = traceSink({ files: () => files, joining, report: (error) => { throw error } })
    await sink.write('r2', [step('A')], { mode: 'failed' })
    expect(await readTrace(files, 'r2')).toHaveLength(1)
    await sink.write('r2', [step('B')], { mode: 'failed', ended: 'succeeded' })
    expect(await readTrace(files, 'r2')).toEqual([])
    await sink.write('r3', [step('A')], { mode: 'none', ended: 'failed' })
    expect(await files.providers.private!.store.list('workflows/')).toEqual([])
  })

  it('reports a trace it cannot write, and resolves so the run goes on', async () => {
    const report = vi.fn()
    await expect(traceSink({ files: () => undefined, joining, report }).write('r4', [step('A')], { mode: 'all' })).resolves.toBeUndefined()
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('"private" file provider') }))
  })

  it('reads parts kept in the same millisecond in the order they were written', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(Date.UTC(2026, 10, 8, 9)) })
    const sink = traceSink({ files: () => files, joining, report: (error) => { throw error } })
    for (const state of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) await sink.write('r9', [step(state)], { mode: 'all' })
    vi.useRealTimers()
    expect((await readTrace(files, 'r9')).map((line) => line.state)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'])
  })

  it('reads the parts of a run that goes on in the order they were kept, and gives a replay no steps of a run without a trace', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const sink = traceSink({ files: () => files, joining, report: (error) => { throw error } })
    // A part is named by when it was kept, so the parts read in that order and not in the order they were written: here
    // each segment's part is kept a minute before the one before it.
    for (const [index, state] of ['A', 'B', 'C'].entries()) {
      vi.setSystemTime(new Date(Date.UTC(2026, 10, 8, 9, 3 - index)))
      await sink.write('r7', [{ ...step(state), seq: index }], { mode: 'all' })
    }
    vi.useRealTimers()
    expect((await readTrace(files, 'r7')).map((line) => line.state)).toEqual(['C', 'B', 'A'])
    expect((await sink.read('r7'))?.map((line) => line.state)).toEqual(['C', 'B', 'A'])
    expect(await sink.read('r8')).toBeUndefined()
  })

  it('reads no steps where the app keeps no private files', async () => {
    expect(await readTrace(undefined, 'r1')).toEqual([])
  })
})
