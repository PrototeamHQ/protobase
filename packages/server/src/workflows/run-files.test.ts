import { readdir } from 'node:fs/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { StepError } from '@protobase/workflows'
import { localFiles } from '../files/local-files'
import type { FilesRuntime } from '../files/runtime'
import { tempDir } from '../files/testing/temp-dir'
import { runFiles } from './plugin-services'
import { runFileLimit } from './run-files'

describe("a run's files", () => {
  let folder: Awaited<ReturnType<typeof tempDir>>
  let files: FilesRuntime

  beforeAll(async () => {
    folder = await tempDir()
    files = { providers: { private: localFiles({ dir: folder.dir }) } } as unknown as FilesRuntime
  })
  afterAll(() => folder.remove())

  it('keeps a file of at most 10 MiB, which the run reads back, and refuses a larger one before it writes anything', async () => {
    const run = runFiles(() => files, 'run-1')
    const kept = await run.keep(new Uint8Array(runFileLimit), 'full.bin', 'application/octet-stream')
    expect((await run.read(kept, 'file')).bytes.length).toBe(runFileLimit)
    const before = await readdir(folder.dir, { recursive: true })
    const refused = await run.keep(new Uint8Array(runFileLimit + 1), 'big.bin', 'application/octet-stream').catch((error: unknown) => error)
    expect(refused).toBeInstanceOf(StepError)
    expect((refused as StepError).reason).toBe('big.bin is larger than 10 MiB, the most a run keeps of one file')
    expect(await readdir(folder.dir, { recursive: true })).toEqual(before)
  })
})
