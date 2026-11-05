import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { localFiles } from '../files/local-files'
import type { FilesRuntime } from '../files/runtime'
import { tempDir } from '../files/testing/temp-dir'
import { checkpointValues, inlineValueBytes } from './checkpoint-values'
import { scratchFiles } from './scratch-files'

describe('checkpointValues', () => {
  let folder: Awaited<ReturnType<typeof tempDir>>
  let files: FilesRuntime
  beforeEach(async () => {
    folder = await tempDir()
    files = { providers: { private: localFiles({ dir: `${folder.dir}/private` }) } } as unknown as FilesRuntime
  })
  afterEach(() => folder.remove())

  it('keeps small values in the row, and large ones as a file of the run that it reads back, the scratch copy first', async () => {
    const scratch = scratchFiles({ dir: `${folder.dir}/scratch`, maxBytes: 1024 * 1024 })
    const values = checkpointValues(() => files, scratch)
    const small = { value: { id: 1 }, variables: { sent: '<1@x>' } }
    expect(await values.keep('r1', small)).toEqual(small)

    const large = { value: { body: 'x'.repeat(inlineValueBytes) }, variables: {} }
    const kept = await values.keep('r1', large)
    expect(kept).toEqual({ blob: expect.stringMatching(/^workflows\/r1\/checkpoints\/.+\.json$/) })
    const blob = (kept as { blob: string }).blob
    expect(await scratch.read(blob)).toBeDefined()
    expect(await values.read(blob)).toEqual(large)
    // The scratch disk gone, the private provider's copy is what is read.
    expect(await checkpointValues(() => files).read(blob)).toEqual(large)
  })

  it('keeps large values in the row when the app has no private files', async () => {
    const large = { value: 'x'.repeat(inlineValueBytes + 1), variables: {} }
    expect(await checkpointValues(() => undefined).keep('r1', large)).toEqual(large)
  })
})
