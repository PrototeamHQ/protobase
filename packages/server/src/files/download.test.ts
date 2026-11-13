import { afterEach, describe, expect, it } from 'vitest'
import { appReadMaxBytes, appReadUrl } from '@protobase/schema/internal'
import type { Deps } from '../deps'
import { serveFile } from './download'
import { createFilesRuntime } from './runtime'
import { s3Files, s3FileStore } from './s3-files'
import type { FileProvider, FileStore } from './store'
import { fakeBucket } from './testing/fake-bucket'
import { fakeS3Server } from './testing/fake-s3-server'

const review = new TextEncoder().encode(JSON.stringify({ version: 1, notes: 'x'.repeat(3150) }))

// A public provider, so a read needs no row behind a signed link.
const depsWith = (provider: FileProvider) => {
  const files = createFilesRuntime({ options: { providers: { public: { ...provider, public: true } } }, env: {}, secret: 'test', models: [], systemPath: '/api' })
  return { files } as Deps
}

const serve = (deps: Deps, path: string, headers: Record<string, string> = {}) => serveFile(deps, new Request(`http://app.test${appReadUrl(`/api/files/public/${path}`)}`, { headers }), 'public', path)

// Bun's S3 client, which the bucket providers use, runs only on Bun.
describe.runIf(process.versions.bun !== undefined)('an app read from a bucket whose HEAD has no Content-Length', () => {
  let s3: Awaited<ReturnType<typeof fakeS3Server>>
  afterEach(() => s3.close())

  const bucketDeps = async () => {
    s3 = await fakeS3Server()
    return depsWith(s3Files({ bucket: 'files', prefix: 'app/public', endpoint: s3.endpoint, region: 'auto', accessKeyId: 'key', secretAccessKey: 'secret' }))
  }

  it('reads an application/json file whole, and its ranges', async () => {
    const deps = await bucketDeps()
    s3.put('files', 'app/public/_/review.json', review, 'application/json')

    const read = await serve(deps, '_/review.json')
    expect(read.status).toBe(200)
    expect(read.headers.get('content-type')).toBe('application/json')
    expect(new Uint8Array(await read.arrayBuffer())).toEqual(review)

    const part = await serve(deps, '_/review.json', { range: 'bytes=0-9' })
    expect(part.status).toBe(206)
    expect(part.headers.get('content-range')).toBe(`bytes 0-9/${review.length}`)
    expect(await part.text()).toBe(new TextDecoder().decode(review.slice(0, 10)))
  })

  it('tells an empty file from one whose HEAD left its size out', async () => {
    const deps = await bucketDeps()
    s3.put('files', 'app/public/_/empty.json', new Uint8Array(), 'application/json')
    s3.put('files', 'app/public/_/empty.json.old', review, 'application/json')
    const { store } = deps.files!.providers.public!

    expect(await store.head('_/empty.json')).toMatchObject({ size: 0 })
    expect(await store.head('_/empty.json.old')).toMatchObject({ size: review.length })
    expect(await store.head('_/missing.json')).toBeUndefined()
  })
})

describe('an app read', () => {
  it('fails as it streams past the read limit, whatever size the store reported', async () => {
    const store: FileStore = {
      ...s3FileStore(fakeBucket().bucket),
      head: async (path) => ({ path, size: 0, modified: new Date(0) }),
      read: async () => new Blob([new Uint8Array(appReadMaxBytes + 1)]).stream(),
    }
    const read = await serve(depsWith({ store, public: true }), '_/large.json')
    expect(read.headers.get('content-length')).toBeNull()
    await expect(read.arrayBuffer()).rejects.toThrow(`larger than the ${appReadMaxBytes} bytes`)
  })
})
