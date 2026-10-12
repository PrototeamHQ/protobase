import { describe, expect, it } from 'vitest'
import { s3Files, s3FileStore } from './s3-files'
import { fakeBucket } from './testing/fake-bucket'

const streamOf = (text: string) => new Blob([text]).stream()
const textOf = async (stream: ReadableStream<Uint8Array> | undefined) => new Response(stream).text()

describe('the S3 file store', () => {
  it('writes, reads whole and in ranges, lists every page and deletes, under its prefix', async () => {
    const { bucket, objects } = fakeBucket()
    const store = s3FileStore(bucket, '/apps/42/')
    expect(await store.put('acme/a.txt', streamOf('hello world'))).toEqual({ size: 11 })
    await store.put('acme/b.txt', streamOf('b'))
    await store.put('acme/c.txt', streamOf('c'))
    await store.put('.cleanup/x.json', streamOf('{}'))
    objects.set('apps/42/acme/folder/', { bytes: new Uint8Array(), type: '', disposition: '', modified: new Date() })
    expect([...objects.keys()]).toContain('apps/42/acme/a.txt')

    expect(await textOf(await store.read('acme/a.txt'))).toBe('hello world')
    expect(await textOf(await store.read('acme/a.txt', { start: 6, end: 10 }))).toBe('world')
    expect(await store.head('acme/a.txt')).toMatchObject({ path: 'acme/a.txt', size: 11 })
    expect((await store.list('acme/')).map((object) => object.path)).toEqual(['acme/a.txt', 'acme/b.txt', 'acme/c.txt'])
    expect((await store.list('')).map((object) => object.path)).toEqual(['.cleanup/x.json', 'acme/a.txt', 'acme/b.txt', 'acme/c.txt'])

    await store.delete('acme/a.txt')
    await store.delete('acme/a.txt')
    expect(await store.head('acme/a.txt')).toBeUndefined()
    expect(await store.read('acme/a.txt')).toBeUndefined()
    expect(await store.list('nothing/')).toEqual([])
  })

  it('stores each object with the type and disposition its path is served as', async () => {
    const { bucket, objects } = fakeBucket()
    const store = s3FileStore(bucket)
    await store.put('_/photo.jpg', streamOf('x'))
    await store.put('_/notes.svg', streamOf('x'))
    expect(objects.get('_/photo.jpg')).toMatchObject({ type: 'image/jpeg', disposition: `inline; filename="photo.jpg"; filename*=UTF-8''photo.jpg` })
    expect(objects.get('_/notes.svg')).toMatchObject({ type: 'image/svg+xml', disposition: expect.stringMatching(/^attachment;/) })
  })

  it('stores nothing when a write fails half way', async () => {
    const { bucket, objects } = fakeBucket()
    const failing = new ReadableStream<Uint8Array>({
      start: (controller) => {
        controller.enqueue(new TextEncoder().encode('part'))
        controller.error(new Error('the client went away'))
      },
    })
    await expect(s3FileStore(bucket).put('acme/c.txt', failing)).rejects.toThrow('the client went away')
    expect(objects.size).toBe(0)
  })

  it('presigns a download link lasting until the given time, with its type and disposition', async () => {
    const { bucket } = fakeBucket()
    const expires = Math.floor(Date.now() / 1000) + 600
    const url = new URL(await s3FileStore(bucket, 'apps/42').downloadUrl!('acme/a.pdf', { expires, type: 'application/pdf', disposition: 'inline; filename="a.pdf"' }))
    expect(url.pathname).toBe('/apps/42/acme/a.pdf')
    expect(Number(url.searchParams.get('X-Amz-Expires'))).toBeGreaterThanOrEqual(599)
    expect(url.searchParams.get('response-content-type')).toBe('application/pdf')
    expect(url.searchParams.get('response-content-disposition')).toBe('inline; filename="a.pdf"')
  })
})

describe('s3Files', () => {
  it('links public files from the bucket\'s public address, under the prefix', () => {
    const provider = s3Files({ bucket: 'files', prefix: 'apps/42/public/', publicUrl: 'https://files.example.com/', retention: '0' })
    expect(provider).toMatchObject({ public: true, publicUrl: 'https://files.example.com/apps/42/public', retention: 0 })
    expect(s3Files({ bucket: 'files' })).toMatchObject({ public: false })
    expect(s3Files({ bucket: 'files' }).publicUrl).toBeUndefined()
    expect(() => s3Files({ bucket: '' })).toThrow('s3Files needs a bucket')
  })
})
