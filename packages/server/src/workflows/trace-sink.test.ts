import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StepRecord } from '@protobase/workflows'
import { localFiles } from '../files/local-files'
import type { FilesRuntime } from '../files/runtime'
import { tempDir } from '../files/testing/temp-dir'
import { readTrace, traceSink } from './trace-sink'

const step = (state: string): StepRecord => ({ scope: '', seq: 0, state, type: 'Task', status: 'succeeded', attempt: 1, input: { n: 1 }, output: 'ok', next: null, logs: [], startedAt: new Date(0), finishedAt: new Date(0), recorded: false })

describe('traceSink', () => {
  let folder: Awaited<ReturnType<typeof tempDir>>
  let files: FilesRuntime
  let named: [string, string][]
  const kept = async (runId: string, file: string) => void named.push([runId, file])
  beforeEach(async () => {
    folder = await tempDir()
    files = { providers: { private: localFiles({ dir: folder.dir }) } } as unknown as FilesRuntime
    named = []
  })
  afterEach(() => folder.remove())

  it("writes each segment's steps as a part, and joins them into the run's trace when it ends", async () => {
    const sink = traceSink({ files: () => files, kept, report: (error) => { throw error } })
    await sink.write('r1', [step('A')], { mode: 'all' })
    expect((await readTrace(files, 'r1')).map((line) => line.state)).toEqual(['A'])
    await sink.write('r1', [step('B')], { mode: 'all', ended: 'succeeded' })
    expect(await files.providers.private!.store.list('workflows/r1/trace/')).toEqual([])
    expect(await readTrace(files, 'r1')).toEqual([expect.objectContaining({ state: 'A', input: { n: 1 } }), expect.objectContaining({ state: 'B' })])
    expect(named).toEqual([['r1', expect.stringMatching(/^private:workflows\/r1\/trace\.jsonl\?name=trace\.jsonl&size=\d+$/)]])
  })

  it('keeps the steps an ending segment joined when a crash makes that segment run and end again', async () => {
    const sink = traceSink({ files: () => files, kept, report: (error) => { throw error } })
    await sink.write('r5', [step('A')], { mode: 'all' })
    await sink.write('r5', [step('B')], { mode: 'all', ended: 'succeeded' })
    await sink.write('r5', [step('B')], { mode: 'all', ended: 'succeeded' })
    expect((await readTrace(files, 'r5')).map((line) => line.state)).toEqual(['A', 'B', 'B'])
  })

  it('keeps no trace of a run that succeeds when only failing runs keep one, and none at all with none', async () => {
    const sink = traceSink({ files: () => files, kept, report: (error) => { throw error } })
    await sink.write('r2', [step('A')], { mode: 'failed' })
    expect(await readTrace(files, 'r2')).toHaveLength(1)
    await sink.write('r2', [step('B')], { mode: 'failed', ended: 'succeeded' })
    expect(await readTrace(files, 'r2')).toEqual([])
    await sink.write('r3', [step('A')], { mode: 'none', ended: 'failed' })
    expect(await files.providers.private!.store.list('workflows/')).toEqual([])
  })

  it('reports a trace it cannot write, and resolves so the run goes on', async () => {
    const report = vi.fn()
    await expect(traceSink({ files: () => undefined, kept, report }).write('r4', [step('A')], { mode: 'all' })).resolves.toBeUndefined()
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('"private" file provider') }))
  })
})
