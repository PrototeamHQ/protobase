import { readdir } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { SignJWT } from 'jose'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { jwtVerifier } from '../src/auth/jwt'
import { createAdmin } from '../src/create-admin'
import { localFiles } from '../src/files/local-files'
import { png } from '../src/files/testing/samples'
import { tempDir } from '../src/files/testing/temp-dir'
import { testAuthenticator } from '../../../test-support/server'
import { storageUsers } from '../../../test-support/fixtures/storage-ddl'
import { openSnapshotDb } from '../../../test-support/sql-snapshot'

// supabase-js's `storage` as an app moved from Supabase calls it, against the app's /storage/v1 over a local provider,
// under the restored storage policies (test-support/fixtures/storage-ddl.ts).
const publishable = 'sb_publishable_storage_test'
const secret = 'sb_secret_storage_test'
const signingKey = new TextEncoder().encode('storage-test-signing-key-storage-test-key')
const { alice, bob } = storageUsers

const tokenOf = (sub: string) => new SignJWT({ role: 'authenticated' }).setProtectedHeader({ alg: 'HS256' }).setSubject(sub).setExpirationTime('1h').sign(signingKey)

let app: ReturnType<typeof createAdmin>
let files: Awaited<ReturnType<typeof tempDir>>
const fetch = async (input: RequestInfo | URL, init?: RequestInit) => app.request(input instanceof Request ? input : String(input), init)

// A client with the publishable key, signed in as `user` when given, or one with the secret key.
const client = async (as: 'anon' | 'service' | string) =>
  createClient('http://localhost', as === 'service' ? secret : publishable, {
    global: { fetch },
    auth: { persistSession: false, autoRefreshToken: false },
    ...(as !== 'anon' && as !== 'service' && { accessToken: async () => tokenOf(as) }),
  })

// The object files the provider holds.
const storedFiles = async () => (await readdir(files.dir, { recursive: true, withFileTypes: true })).filter((entry) => entry.isFile() && !entry.parentPath.includes('.tmp')).length

beforeAll(async () => {
  const pg = await openSnapshotDb('storage')
  files = await tempDir()
  app = createAdmin({
    resources: [],
    db: pg.db,
    authenticate: testAuthenticator,
    verifyToken: jwtVerifier({ keys: async () => signingKey, algorithms: ['HS256'] }),
    files: { providers: { private: localFiles({ dir: files.dir }) }, secret: 'storage-test-files-secret' },
    options: { apiKeys: { publishable_key: publishable, secret_key: secret } },
  })
})
afterAll(() => files.remove())

describe('supabase.storage against /storage/v1', () => {
  it('uploads an avatar into the user\'s folder, served to anyone at its public URL', async () => {
    const storage = (await client(alice)).storage.from('avatars')
    const uploaded = await storage.upload(`${alice}/me.png`, new Blob([png], { type: 'image/png' }))
    expect(uploaded.error).toBeNull()
    expect(uploaded.data).toMatchObject({ path: `${alice}/me.png`, fullPath: `avatars/${alice}/me.png` })

    const { publicUrl } = storage.getPublicUrl(`${alice}/me.png`).data
    const served = await fetch(publicUrl)
    expect(served.status).toBe(200)
    expect(served.headers.get('content-type')).toBe('image/png')
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(png)

    const downloaded = await (await client('anon')).storage.from('avatars').download(`${alice}/me.png`)
    expect(new Uint8Array(await downloaded.data!.arrayBuffer())).toEqual(png)
  })

  it('refuses by policy an upload into another user\'s folder, and stores nothing', async () => {
    const before = await storedFiles()
    const intruding = await (await client(bob)).storage.from('avatars').upload(`${alice}/me.png`, new Blob([png], { type: 'image/png' }), { upsert: true })
    expect(intruding.error).toMatchObject({ status: 400, statusCode: '403', message: 'new row violates row-level security policy' })
    const anonymous = await (await client('anon')).storage.from('avatars').upload('someone/me.png', new Blob([png], { type: 'image/png' }))
    expect(anonymous.error).toMatchObject({ statusCode: '403' })
    expect(await storedFiles()).toBe(before)
  })

  it('holds a bucket to its types and size limit', async () => {
    const avatars = (await client(alice)).storage.from('avatars')
    expect((await avatars.upload(`${alice}/notes.txt`, 'hello', { contentType: 'text/plain' })).error).toMatchObject({ statusCode: '415' })
    expect((await avatars.upload(`${alice}/big.png`, new Blob([new Uint8Array(1001)], { type: 'image/png' }))).error).toMatchObject({ statusCode: '413' })
  })

  it('serves a private document only to its owner, and to anyone with a signed URL until it expires', async () => {
    const documents = (await client(alice)).storage.from('documents')
    expect((await documents.upload(`${alice}/report.txt`, 'Quarterly report', { contentType: 'text/plain' })).error).toBeNull()
    expect(await (await documents.download(`${alice}/report.txt`)).data!.text()).toBe('Quarterly report')

    const byBob = await (await client(bob)).storage.from('documents').download(`${alice}/report.txt`)
    expect(byBob.error).toMatchObject({ status: 400, statusCode: '404' })
    expect((await (await client('anon')).storage.from('documents').createSignedUrl(`${alice}/report.txt`, 60)).error).toMatchObject({ statusCode: '404' })

    const { signedUrl } = (await documents.createSignedUrl(`${alice}/report.txt`, 60)).data!
    expect(signedUrl).toMatch(/^http:\/\/localhost\/storage\/v1\/object\/sign\/documents\/.+\?token=/)
    const opened = await fetch(signedUrl)
    expect(opened.status).toBe(200)
    expect(await opened.text()).toBe('Quarterly report')
    expect((await fetch(signedUrl.replace(alice, bob))).status).toBe(400)
  })

  it('lists, moves, copies, describes and removes documents', async () => {
    const documents = (await client(alice)).storage.from('documents')
    await documents.upload(`${alice}/drafts/a.txt`, 'A', { contentType: 'text/plain' })
    const listed = await documents.list(alice)
    expect(listed.data?.map((entry) => [entry.name, entry.id === null])).toEqual([['drafts', true], ['report.txt', false]])

    expect((await documents.move(`${alice}/drafts/a.txt`, `${alice}/a.txt`)).error).toBeNull()
    expect((await documents.copy(`${alice}/a.txt`, `${alice}/b.txt`)).data).toEqual({ path: `documents/${alice}/b.txt` })
    expect((await documents.info(`${alice}/b.txt`)).data).toMatchObject({ name: `${alice}/b.txt`, size: 1, contentType: 'text/plain' })
    expect(await (await documents.download(`${alice}/b.txt`)).data!.text()).toBe('A')
    expect((await documents.update(`${alice}/b.txt`, 'B', { contentType: 'text/plain' })).error).toBeNull()
    expect(await (await documents.download(`${alice}/b.txt`)).data!.text()).toBe('B')
    expect((await documents.exists(`${alice}/b.txt`)).data).toBe(true)
    expect((await documents.exists(`${alice}/drafts/a.txt`)).data).toBe(false)

    const files = await storedFiles()
    const removed = await documents.remove([`${alice}/a.txt`, `${alice}/b.txt`])
    expect(removed.data?.map((row) => row.name)).toEqual([`${alice}/a.txt`, `${alice}/b.txt`])
    expect(await storedFiles()).toBe(files - 2)
    expect((await documents.list(alice)).data?.map((entry) => entry.name)).toEqual(['report.txt'])
  })

  it('uploads to a signed upload URL for the user who signed it', async () => {
    const { token } = (await (await client(alice)).storage.from('documents').createSignedUploadUrl(`${alice}/scan.txt`)).data!
    const uploaded = await (await client('anon')).storage.from('documents').uploadToSignedUrl(`${alice}/scan.txt`, token, 'Scanned', { contentType: 'text/plain' })
    expect(uploaded.error).toBeNull()
    expect(await (await (await client(alice)).storage.from('documents').download(`${alice}/scan.txt`)).data!.text()).toBe('Scanned')
    expect((await (await client(bob)).storage.from('documents').createSignedUploadUrl(`${alice}/other.txt`)).error).toMatchObject({ statusCode: '403' })
  })

  it('manages buckets as the secret key, and lists them to users as the policies allow', async () => {
    const service = (await client('service')).storage
    expect((await service.createBucket('exports', { public: false, fileSizeLimit: '1MB' })).data).toEqual({ name: 'exports' })
    expect((await service.getBucket('exports')).data).toMatchObject({ id: 'exports', public: false, file_size_limit: 1_000_000 })
    expect((await (await client(alice)).storage.listBuckets()).data?.map((bucket) => bucket.id)).toEqual(['avatars', 'documents', 'exports'])
    expect((await (await client('anon')).storage.listBuckets()).data).toEqual([])
    expect((await (await client(alice)).storage.createBucket('mine')).error).toMatchObject({ statusCode: '403' })
    expect((await service.deleteBucket('documents')).error).toMatchObject({ statusCode: '409' })
    expect((await service.deleteBucket('exports')).data).toEqual({ message: 'Successfully deleted' })
  })
})
