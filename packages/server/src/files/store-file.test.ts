import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { localFiles } from './local-files'
import { s3Files } from './s3-files'
import { storeFile } from './store-file'
import { fakeBucket } from './testing/fake-bucket'
import { tempDir } from './testing/temp-dir'

// An s3: provider writes to an in-memory bucket here, as Bun's client would to a real one.
const bucket = vi.hoisted(() => ({ current: undefined as ReturnType<typeof import('./testing/fake-bucket').fakeBucket> | undefined }))
vi.mock('./s3-files', async (load) => {
  const actual = await load<typeof import('./s3-files')>()
  return {
    ...actual,
    s3Files: vi.fn((options: import('./s3-files').S3FilesOptions) => ({ store: actual.s3FileStore(bucket.current!.bucket, options.prefix), public: options.public ?? false })),
  }
})

let folder: Awaited<ReturnType<typeof tempDir>>
beforeEach(async () => {
  folder = await tempDir()
  bucket.current = fakeBucket()
})
afterEach(() => folder.remove())

const bytes = new TextEncoder().encode('a photo')

describe('storeFile', () => {
  it('writes into the folder PROTOBASE_FILES_<NAME> names', async () => {
    const env = { PROTOBASE_FILES_PUBLIC: `${pathToFileURL(folder.dir).href}?public=1` }
    expect(await storeFile({ provider: 'public', path: 'listings/house-1.png', body: bytes, env })).toEqual({ size: 7 })
    expect(await readFile(path.join(folder.dir, 'listings/house-1.png'), 'utf8')).toBe('a photo')
  })

  it('writes into the bucket of an s3: provider, under its prefix', async () => {
    const env = { PROTOBASE_FILES_PUBLIC: 's3://acme-files/apps/42/public?endpoint=https://r2.example.com&public=1', S3_ACCESS_KEY_ID: 'id', S3_SECRET_ACCESS_KEY: 'secret' }
    await storeFile({ provider: 'public', path: 'listings/house-1.card.webp', body: new Blob(['a card']).stream(), env })
    expect(vi.mocked(s3Files)).toHaveBeenLastCalledWith(expect.objectContaining({ bucket: 'acme-files', prefix: '/apps/42/public', accessKeyId: 'id' }))
    const stored = bucket.current!.objects.get('apps/42/public/listings/house-1.card.webp')
    expect(new TextDecoder().decode(stored!.bytes)).toBe('a card')
    expect(stored!.type).toBe('image/webp')
  })

  it('writes into a provider the config declares, unless the environment replaces it', async () => {
    const files = { providers: { archive: localFiles({ dir: folder.dir }) } }
    await storeFile({ provider: 'archive', path: 'a.txt', body: bytes, files, env: {} })
    expect(await readFile(path.join(folder.dir, 'a.txt'), 'utf8')).toBe('a photo')
    await storeFile({ provider: 'archive', path: 'b.txt', body: bytes, files, env: { PROTOBASE_FILES_ARCHIVE: 's3://acme-files', S3_ACCESS_KEY_ID: 'id', S3_SECRET_ACCESS_KEY: 'secret' } })
    expect([...bucket.current!.objects.keys()]).toEqual(['b.txt'])
  })

  it('fails for a provider the app does not have', async () => {
    await expect(storeFile({ provider: 'archive', path: 'a.txt', body: bytes, env: {} })).rejects.toThrow('No file provider "archive"')
  })
})
