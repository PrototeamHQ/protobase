import { readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { tempDir } from '../files/testing/temp-dir'
import { scratchFiles } from './scratch-files'

describe('scratchFiles', () => {
  let folder: Awaited<ReturnType<typeof tempDir>>
  beforeEach(async () => {
    folder = await tempDir()
  })
  afterEach(() => folder.remove())

  it('keeps at most its size, dropping the least recently used file first', async () => {
    const scratch = scratchFiles({ dir: folder.dir, maxBytes: 10 })
    await scratch.put('workflows/r/a', new Uint8Array(4))
    await scratch.put('workflows/r/b', new Uint8Array(4))
    expect(await scratch.read('workflows/r/a')).toEqual(new Uint8Array(4))
    await scratch.put('workflows/r/c', new Uint8Array(4))
    expect(await scratch.read('workflows/r/b')).toBeUndefined()
    expect(await scratch.read('workflows/r/a')).toHaveLength(4)
    expect(await readdir(join(folder.dir, 'protobase-workflows'))).toHaveLength(2)
    await scratch.put('workflows/r/huge', new Uint8Array(11))
    expect(await scratch.read('workflows/r/huge')).toBeUndefined()
  })

  it('empties its own folder as it starts, and reads nothing of a file removed under it', async () => {
    const first = scratchFiles({ dir: folder.dir, maxBytes: 10 })
    await first.put('workflows/r/a', new Uint8Array(4))
    const second = scratchFiles({ dir: folder.dir, maxBytes: 10 })
    expect(await second.read('workflows/r/a')).toBeUndefined()
    expect(await readdir(join(folder.dir, 'protobase-workflows'))).toEqual([])
    await second.put('workflows/r/b', new Uint8Array(4))
    await rm(join(folder.dir, 'protobase-workflows'), { recursive: true })
    expect(await second.read('workflows/r/b')).toBeUndefined()
  })
})
