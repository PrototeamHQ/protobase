import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { localFileStore } from './local-files'
import { tempDir } from './testing/temp-dir'

const streamOf = (text: string) => new Blob([text]).stream()
const textOf = async (stream: ReadableStream<Uint8Array> | undefined) => new Response(stream).text()

let folder: Awaited<ReturnType<typeof tempDir>>
beforeEach(async () => {
  folder = await tempDir()
})
afterEach(() => folder.remove())

describe('the local file store', () => {
  it('writes, reads whole and in ranges, lists and deletes', async () => {
    const store = localFileStore(folder.dir)
    expect(await store.put('acme/a.txt', streamOf('hello world'))).toEqual({ size: 11 })
    await store.put('acme/b.txt', streamOf('b'))
    expect(await textOf(await store.read('acme/a.txt'))).toBe('hello world')
    expect(await textOf(await store.read('acme/a.txt', { start: 6, end: 10 }))).toBe('world')
    expect(await store.head('acme/a.txt')).toMatchObject({ path: 'acme/a.txt', size: 11 })
    expect((await store.list('acme/')).map((object) => object.path)).toEqual(['acme/a.txt', 'acme/b.txt'])
    await store.delete('acme/a.txt')
    await store.delete('acme/a.txt')
    expect(await store.head('acme/a.txt')).toBeUndefined()
    expect(await store.read('acme/a.txt')).toBeUndefined()
    expect(await store.list('nothing/')).toEqual([])
  })

  it('leaves nothing behind when a write fails half way', async () => {
    const store = localFileStore(folder.dir)
    const failing = new ReadableStream<Uint8Array>({
      start: (controller) => {
        controller.enqueue(new TextEncoder().encode('part'))
        controller.error(new Error('the client went away'))
      },
    })
    await expect(store.put('acme/c.txt', failing)).rejects.toThrow('the client went away')
    expect(await store.head('acme/c.txt')).toBeUndefined()
    expect(await readdir(path.join(folder.dir, '.tmp'))).toEqual([])
  })

  it('never reaches outside its folder', async () => {
    const store = localFileStore(folder.dir)
    await expect(store.put('../escape.txt', streamOf('x'))).rejects.toThrow('outside the file store')
    await expect(store.read('/etc/passwd')).rejects.toThrow('outside the file store')
  })
})
