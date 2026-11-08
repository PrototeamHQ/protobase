import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { StepError } from '@protobase/workflows'
import { UnreadableValue } from '../../encryption/unreadable-value'
import { fileProviderOf, type FileProviderSettings } from '../../files/provider-settings'
import { s3FileStore } from '../../files/s3-files'
import { fakeBucket } from '../../files/testing/fake-bucket'
import { HttpProblem } from '../../problem'
import type { Row, Session } from '../../types'
import { saverSession } from '../plugin-records'
import { editorSession, storageService } from './plugin-storage'
import type { ConfigurationSources } from './resolve-configuration'

const accessKey = 'AKIDEXAMPLE0001'
const secretKey = 'wJalrXUtnFEMI-secret-example'
const session: Session = { user: { id: 'u1', roles: ['author'] } }
const textOf = (stream: ReadableStream<Uint8Array>) => new Response(stream).text()
const streamOf = (text: string) => new Blob([text]).stream()
const failure = (promise: Promise<unknown>) => promise.then(() => undefined, (error: unknown) => (error instanceof StepError ? [error.error, error.reason] : error))

let base: string
let rows: Row[]
let built: FileProviderSettings[]
let opened: string[]
let keys: Record<string, string | null>
let bucket: ReturnType<typeof fakeBucket>

const sources = (overrides: Partial<ConfigurationSources> = {}): ConfigurationSources => ({
  storage: { root: join(base, 'root'), endpoints: ['https://storage.example.com'] },
  list: async (_session, name) => rows.filter((row) => row.name === name),
  decrypt: () => async (_resource, _key, field) => (opened.push(field), keys[field] ?? null),
  providerDirs: () => [join(base, 'files', 'private')],
  allowPrivateAddresses: false,
  node: 'node-1',
  environment: { PATH: '/usr/bin', AWS_ACCESS_KEY_ID: 'AKIDOPERATOR' },
  resolve: async () => ['93.184.216.34'],
  provider: (name, settings) => {
    built.push(settings)
    return settings.kind === 's3' ? { store: s3FileStore(bucket.bucket), public: false } : fileProviderOf(name, settings)
  },
  ...overrides,
})

const endpoint = 'https://storage.example.com'
// A stream that records whether it was cancelled, as an answer's body lets its connection go.
const watchedStream = (text: string) => {
  const state = { cancelled: false }
  const stream = new ReadableStream<Uint8Array>({ start: (controller) => controller.enqueue(new TextEncoder().encode(text)), cancel: () => void (state.cancelled = true) })
  return { stream, state }
}

const storage = (overrides: Partial<ConfigurationSources> = {}) => storageService(async () => session, 'run-1', sources(overrides))

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'storage-service-'))
  rows = [{ id: 'c1', name: 'archive', kind: 'local', dir: 'archive' }]
  built = []
  opened = []
  keys = { access_key_id: accessKey, secret_access_key: secretKey }
  bucket = fakeBucket()
})
afterEach(async () => { await rm(base, { recursive: true, force: true }) })

describe('the storage service', () => {
  it('stores a stream in a local configuration and reads it back, its reference naming the configuration and node, not the folder', async () => {
    const stored = await storage().put('archive', 'in/report.pdf', streamOf('%PDF report'), { name: 'report.pdf', type: 'application/pdf' })
    expect(stored).toEqual({ configuration: 'archive', node: 'node-1', path: 'in/report.pdf', name: 'report.pdf', type: 'application/pdf', size: 11 })
    expect(existsSync(join(base, 'root', 'archive', 'in', 'report.pdf'))).toBe(true)
    expect(await textOf((await storage().read(stored, 'file')).body)).toBe('%PDF report')
    expect(opened).toEqual([])
  })

  it('keeps the same calls working when the configuration is switched from S3 to a local folder', async () => {
    rows = [{ id: 'c1', name: 'archive', kind: 's3', bucket: 'acme-files', region: 'eu-west-1', endpoint }]
    const inBucket = await storage().put('archive', 'a.txt', streamOf('from s3'), { name: 'a.txt', type: 'text/plain' })
    expect(inBucket).toEqual({ configuration: 'archive', path: 'a.txt', name: 'a.txt', type: 'text/plain', size: 7 })
    expect(built.at(-1)).toEqual({ kind: 's3', bucket: 'acme-files', region: 'eu-west-1', endpoint, accessKeyId: accessKey, secretAccessKey: secretKey })
    rows = [{ id: 'c1', name: 'archive', kind: 'local', dir: 'archive' }]
    const onDisk = await storage().put('archive', 'a.txt', streamOf('from disk'), { name: 'a.txt', type: 'text/plain' })
    expect(onDisk).toMatchObject({ configuration: 'archive', node: 'node-1', path: 'a.txt' })
    expect(await textOf((await storage().read(onDisk, 'file')).body)).toBe('from disk')
  })

  it('fails the same way for a configuration that is not there, not readable, of another tenant or with storage off, and builds no store', async () => {
    const missing = ['Storage.NotFound', 'No storage configuration "other" this workflow may use']
    expect(await failure(storage().put('other', 'a', streamOf('x'), { name: 'a', type: 'text/plain' }))).toEqual(missing)
    const refused = storage({ list: () => Promise.reject(new HttpProblem(403, 'forbidden', 'Forbidden', 'storage_configurations.read')) })
    expect(await failure(refused.put('other', 'a', streamOf('x'), { name: 'a', type: 'text/plain' }))).toEqual(missing)
    expect(await failure(storage({ list: async () => [] }).put('other', 'a', streamOf('x'), { name: 'a', type: 'text/plain' }))).toEqual(missing)
    expect(await failure(storage({ storage: undefined }).put('other', 'a', streamOf('x'), { name: 'a', type: 'text/plain' }))).toEqual(missing)
    expect(built).toEqual([])
    expect(opened).toEqual([])
  })

  it('lets a version with no editor, or one who holds no role now, use no configuration', async () => {
    const roles = async () => [] as string[]
    for (const make of [() => saverSession(roles, null, undefined), () => saverSession(roles, 'u1', undefined)]) {
      expect(await failure(editorSession(make))).toEqual(['Storage.NotFound', "The workflow's last editor may use no storage configuration"])
    }
    let listed = 0
    const noEditor = storageService(() => saverSession(roles, 'u1', undefined), 'run-1', sources({ list: async () => (listed++, rows) }))
    expect(await failure(noEditor.put('archive', 'a', streamOf('x'), { name: 'a', type: 'text/plain' }))).toEqual(['Storage.NotFound', "The workflow's last editor may use no storage configuration"])
    expect(listed).toBe(0)
  })

  it('refuses a path or a forged stored file that would leave the configuration before reading any configuration', async () => {
    let listed = 0
    const counted = storage({ list: async () => (listed++, rows) })
    for (const path of ['../outside', '/etc/passwd', '.tmp/x', '..%2f..', 'a\0b']) {
      expect((await failure(counted.put('archive', path, streamOf('x'), { name: 'a', type: 'text/plain' })) as string[])[0]).toBe('Storage.InvalidArguments')
      expect((await failure(counted.read({ configuration: 'archive', path, name: 'a', type: 'text/plain', size: 1 }, 'file')) as string[])[0]).toBe('Storage.InvalidArguments')
    }
    expect(await failure(counted.read({ configuration: '../x', path: 'a', name: 'a', type: 'text/plain', size: 1 }, 'file'))).toEqual(['Storage.InvalidArguments', 'file is not a stored file ({ configuration, path, name, type, size })'])
    expect(listed).toBe(0)
    expect(existsSync(join(base, 'outside'))).toBe(false)
  })

  it('fails a read of a file that is gone as Storage.NotFound', async () => {
    expect(await failure(storage().read({ configuration: 'archive', path: 'gone.txt', name: 'gone.txt', type: 'text/plain', size: 1 }, 'file'))).toEqual(['Storage.NotFound', 'file names a file that is gone from "archive"'])
  })

  it('makes no request for an S3 configuration without keys, with keys that do not open, or whose endpoint now resolves to a private address', async () => {
    rows = [{ id: 'c1', name: 'archive', kind: 's3', bucket: 'acme-files', region: 'eu-west-1', endpoint }]
    keys = { access_key_id: null, secret_access_key: null }
    expect(await failure(storage().put('archive', 'a', streamOf('x'), { name: 'a', type: 'text/plain' }))).toEqual(['Storage.Unavailable', 'The storage configuration "archive" cannot be used: it has no access keys; set access_key_id and secret_access_key'])
    const unreadable = new UnreadableValue('failed-authentication', { resource: 'storage_configurations', field: 'secret_access_key' }, { key: ['c1'] } as never)
    const failing = storage({ decrypt: () => () => Promise.reject(unreadable) })
    const [name, cause] = (await failure(failing.put('archive', 'a', streamOf('x'), { name: 'a', type: 'text/plain' }))) as string[]
    expect([name, cause]).toEqual(['Storage.Unavailable', 'The storage configuration "archive" cannot be used: its access keys cannot be decrypted; set them again'])
    keys = { access_key_id: accessKey, secret_access_key: secretKey }
    for (const address of ['10.0.0.1', '169.254.169.254', '::ffff:169.254.169.254']) {
      expect((await failure(storage({ resolve: async () => [address] }).put('archive', 'a', streamOf('x'), { name: 'a', type: 'text/plain' })) as string[])[0]).toBe('Storage.Unavailable')
    }
    expect(built).toEqual([])
  })

  it('refuses an S3 configuration while the server sets an endpoint, region or session token the S3 client would use, before opening its keys', async () => {
    rows = [{ id: 'c1', name: 'archive', kind: 's3', bucket: 'acme-files', region: 'eu-west-1', endpoint }]
    for (const variable of ['S3_ENDPOINT', 'AWS_ENDPOINT', 'S3_REGION', 'AWS_REGION', 'S3_SESSION_TOKEN', 'AWS_SESSION_TOKEN']) {
      const leaking = storage({ environment: { [variable]: 'operator-value' } })
      expect(await failure(leaking.put('archive', 'a', streamOf('x'), { name: 'a', type: 'text/plain' }))).toEqual(['Storage.Unavailable', `The storage configuration "archive" cannot be used: the server sets ${variable}, which the S3 client would use for this configuration`])
    }
    expect(opened).toEqual([])
    expect(built).toEqual([])
    // A local configuration is not the S3 client's, so it still works.
    rows = [{ id: 'c1', name: 'archive', kind: 'local', dir: 'archive' }]
    expect(await storage({ environment: { AWS_SESSION_TOKEN: 'operator-value' } }).put('archive', 'a', streamOf('x'), { name: 'a', type: 'text/plain' })).toMatchObject({ path: 'a' })
  })

  it('opens a configuration and checks a path before there is a body, and cancels a body whose put fails', async () => {
    let listed = 0
    const counted = storage({ list: async (_session, name) => (listed++, rows.filter((row) => row.name === name)) })
    expect((await failure(counted.open('archive', '../outside')) as string[])[0]).toBe('Storage.InvalidArguments')
    expect(listed).toBe(0)
    expect(await failure(counted.open('other', 'a'))).toEqual(['Storage.NotFound', 'No storage configuration "other" this workflow may use'])
    const target = await counted.open('archive', 'in/a.txt')
    expect(await target.put(streamOf('opened'), { name: 'a.txt', type: 'text/plain' })).toMatchObject({ configuration: 'archive', path: 'in/a.txt', size: 6 })

    const refused = watchedStream('x')
    expect((await failure(counted.put('other', 'a', refused.stream, { name: 'a', type: 'text/plain' })) as string[])[0]).toBe('Storage.NotFound')
    expect(refused.state.cancelled).toBe(true)
    const unstored = watchedStream('x')
    const failing = storage({ provider: (name, settings) => {
      const { store } = fileProviderOf(name, settings)
      return { store: { ...store, put: () => Promise.reject(Object.assign(new Error('no'), { code: 'EACCES' })) }, public: false }
    } })
    expect(await failure((await failing.open('archive', 'a')).put(unstored.stream, { name: 'a', type: 'text/plain' }))).toEqual(['Storage.Failed', 'The store failed with EACCES'])
    expect(unstored.state.cancelled).toBe(true)
  })

  it('fails as Storage.Failed when the local folder cannot be made', async () => {
    await writeFile(join(base, 'file'), '')
    const result = await failure(storage({ storage: { root: join(base, 'file', 'root'), endpoints: [] } }).put('archive', 'a', streamOf('x'), { name: 'a', type: 'text/plain' }))
    expect(result).toEqual(['Storage.Failed', 'The store failed with ENOTDIR'])
  })

  it('fails as Storage.Failed when the store fails partway through a read', async () => {
    const broken = new ReadableStream<Uint8Array>({ pull: (controller) => controller.error(Object.assign(new Error('read /srv/private/a failed'), { code: 'EIO' })) })
    const failing = storage({ provider: (name, settings) => {
      const { store } = fileProviderOf(name, settings)
      return { store: { ...store, read: async () => broken }, public: false }
    } })
    const { body } = await failing.read({ configuration: 'archive', path: 'a', name: 'a', type: 'text/plain', size: 1 }, 'file')
    expect(await failure(textOf(body))).toEqual(['Storage.Failed', 'The store failed with EIO'])
  })

  it('names only the code of a store that fails, never its message, and keeps the keys out of every result', async () => {
    rows = [{ id: 'c1', name: 'archive', kind: 's3', bucket: 'acme-files', region: 'eu-west-1', endpoint }]
    const leaking = Object.assign(new Error(`denied for ${accessKey} with ${secretKey} at /srv/private`), { code: 'AccessDenied' })
    const failing = storage({ provider: () => ({ store: { ...s3FileStore(bucket.bucket), put: () => Promise.reject(leaking) }, public: false }) })
    const result = await failure(failing.put('archive', 'a', streamOf('x'), { name: 'a', type: 'text/plain' }))
    expect(result).toEqual(['Storage.Failed', 'The store failed with AccessDenied'])
    const stored = await storage().put('archive', 'a', streamOf('x'), { name: 'a', type: 'text/plain' })
    const read = await storage().read(stored, 'file')
    for (const text of [JSON.stringify(result), JSON.stringify(stored), JSON.stringify(read.file)]) {
      expect(text).not.toContain(accessKey)
      expect(text).not.toContain(secretKey)
    }
  })
})
