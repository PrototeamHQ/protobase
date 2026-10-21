import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { limitedFileStore, localFileStore, objectKey, type FileStore } from '@protobase/server'
import { copyObject } from './storage-copy'

const hello = new TextEncoder().encode('hello')
const object = { bucket: 'avatars', name: 'users/1/a.txt', version: 'v1', size: 5, eTag: '"5d41402abc4b2a76b9719d911017c592"' }
const serving = (body: Uint8Array<ArrayBuffer> | null, status = 200) => async () => new Response(body, { status })

let dir: string
let store: FileStore
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'protobase-storage-copy-'))
  store = localFileStore(dir)
})
afterEach(() => rm(dir, { recursive: true, force: true }))

const stored = async () => (await store.head(await objectKey(object.bucket, object.name, object.version)))?.size

describe('copyObject', () => {
  it('stores the bytes at the key /storage/v1 serves the object from', async () => {
    expect(await copyObject(serving(hello), store, object)).toEqual({ object, fault: undefined })
    expect(await stored()).toBe(5)
  })

  it('fails the object without storing it when Supabase refuses the download', async () => {
    expect(await copyObject(serving(null, 404), store, object)).toEqual({ object, fault: 'Supabase answered 404' })
    expect(await stored()).toBeUndefined()
  })

  it('deletes a copy that does not match what Supabase recorded', async () => {
    expect((await copyObject(serving(new TextEncoder().encode('HELLO')), store, object)).fault).toMatch(/^MD5 .* differs from the ETag/)
    expect((await copyObject(serving(new TextEncoder().encode('hell')), store, object)).fault).toBe('read 4 bytes, Supabase recorded 5')
    expect(await stored()).toBeUndefined()
  })

  it('fails the object when the file provider is full', async () => {
    const full = limitedFileStore(store, { maxBytes: 4 })
    expect(await copyObject(serving(hello), full, object)).toEqual({ object, fault: 'the file provider is full' })
  })
})
