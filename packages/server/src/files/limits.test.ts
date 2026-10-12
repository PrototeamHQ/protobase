import { describe, expect, it } from 'vitest'
import { HttpProblem } from '../problem'
import { limitedFileStore, recountMs } from './limits'
import { s3FileStore } from './s3-files'
import { fakeBucket } from './testing/fake-bucket'

const bytes = (count: number) => new Blob([new Uint8Array(count)]).stream()

const refusal = async (promise: Promise<unknown>) => {
  const error = await promise.then(() => undefined, (caught: unknown) => caught)
  return error instanceof HttpProblem ? { status: error.status, slug: error.slug } : error
}

describe('file limits', () => {
  it('refuse a file past maxFiles with 507, counting files only', async () => {
    const { bucket, objects } = fakeBucket()
    const store = limitedFileStore(s3FileStore(bucket), { maxFiles: 2 })
    await store.put('a/1.bin', bytes(1))
    await store.put('.cleanup/x.json', bytes(1))
    await store.put('a/2.bin', bytes(1))
    expect(await refusal(store.put('a/3.bin', bytes(1)))).toEqual({ status: 507, slug: 'storage-full' })
    expect(objects.has('a/3.bin')).toBe(false)
    // Scheduled deletes still go in, so a full store can still be emptied.
    await store.put('.cleanup/y.json', bytes(1))

    await store.delete('a/1.bin')
    await store.put('a/3.bin', bytes(1))
  })

  it('stop an upload with 507 once it passes maxBytes, storing nothing', async () => {
    const { bucket, objects } = fakeBucket()
    const store = limitedFileStore(s3FileStore(bucket), { maxBytes: '1 KB' })
    await store.put('a/1.bin', bytes(600))
    expect(await refusal(store.put('a/2.bin', bytes(401)))).toEqual({ status: 507, slug: 'storage-full' })
    expect(objects.has('a/2.bin')).toBe(false)
    expect(await store.put('a/2.bin', bytes(400))).toEqual({ size: 400 })
  })

  it('count what the store holds again once the count is old', async () => {
    const { bucket } = fakeBucket()
    let now = 0
    const inner = s3FileStore(bucket)
    const store = limitedFileStore(inner, { maxFiles: 2 }, () => now)
    await store.put('a/1.bin', bytes(1))
    // Written by another instance: unseen until the count is taken again.
    await inner.put('a/2.bin', bytes(1))
    await store.put('a/3.bin', bytes(1))
    now += recountMs
    expect(await refusal(store.put('a/4.bin', bytes(1)))).toEqual({ status: 507, slug: 'storage-full' })
  })

  it('leave a store without limits as it is, and refuse limits that are no number', () => {
    const store = s3FileStore(fakeBucket().bucket)
    expect(limitedFileStore(store, {})).toBe(store)
    expect(() => limitedFileStore(store, { maxFiles: 0 })).toThrow('maxFiles must be a positive whole number, not 0')
    expect(() => limitedFileStore(store, { maxBytes: 'lots' })).toThrow('"lots" is not a size')
  })
})
