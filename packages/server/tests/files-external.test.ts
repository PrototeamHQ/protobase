import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { sql } from 'kysely'
import { localFiles } from '@protobase/server'
import { as, json } from '../../../test-support/server'
import { png } from '../src/files/testing/samples'
import { createFilesFixture } from './support/files-fixture'

let fixture: Awaited<ReturnType<typeof createFilesFixture>>
afterEach(() => fixture.close())

const day = 86_400_000
const photo = 'https://images.example.com/listings/42/front%20door.jpg?width=720'

const call = async (path: string, init: RequestInit = {}) => {
  const response = await fixture.app.request(path, init)
  return { status: response.status, body: await response.json(), headers: response.headers }
}

const createProduct = (data: Record<string, unknown>) => call('/api/v1/products', json({ name: 'House', ...data }, as(1)))

const upload = async () => {
  const response = await fixture.app.request('/api/v1/products:upload?field=image&name=a.png', { method: 'POST', headers: as(1), body: png })
  return (await response.json()).value as string
}

describe('external file URLs', () => {
  it('store an https URL as given, with no variants, and link it as it is', async () => {
    fixture = await createFilesFixture({ external: true, placeholder: true, variants: { card: { width: 120, height: 90, fit: 'cover', format: 'webp' } } })
    const created = await createProduct({ image: photo })
    expect(created.status).toBe(201)
    expect(created.body.image).toEqual({ uri: photo, name: 'front door.jpg', type: 'image/jpeg', url: photo })
    expect(created.body.imagePlaceholder).toBeNull()
    const stored = await sql<{ image: string }>`select image from products where id = ${created.body.id}`.execute(fixture.db)
    expect(stored.rows[0]!.image).toBe(photo)
    expect(await fixture.stored('private')).toEqual([])

    // A placeholder an import wrote beside the URL is drawn with it
    await sql`update products set image_placeholder = 'YJqGPQw7sFlslqhFafSE+Q6oJ1h2iHB2Rw' where id = ${created.body.id}`.execute(fixture.db)
    const read = await call(`/api/v1/products/${created.body.id}`, { headers: as(1) })
    expect(read.body.image).toEqual({ uri: photo, name: 'front door.jpg', type: 'image/jpeg', url: photo, placeholder: 'YJqGPQw7sFlslqhFafSE+Q6oJ1h2iHB2Rw' })
  })

  it('refuse a URL that is not https, carries credentials or spaces, or whose extension the field does not take', async () => {
    fixture = await createFilesFixture({ external: true })
    const refused = async (image: string) => (await createProduct({ image })).body
    const invalid = { errors: [{ field: 'image', code: 'invalid-value', message: 'Neither a file uploaded for this field nor an https URL without credentials' }] }
    expect(await refused('http://images.example.com/a.jpg')).toMatchObject(invalid)
    expect(await refused('https://user:secret@images.example.com/a.jpg')).toMatchObject(invalid)
    expect(await refused('https://images.example.com/a b.jpg')).toMatchObject(invalid)
    expect(await refused(' https://images.example.com/a.jpg')).toMatchObject(invalid)
    expect(await refused('https://images.example.com/scan.pdf')).toMatchObject({ errors: [{ field: 'image', message: "This field takes image/*; the URL's extension gives application/pdf" }] })
    expect(await refused('https://images.example.com/photo')).toMatchObject({ errors: [{ field: 'image', message: "This field takes image/*; the URL's extension gives application/octet-stream" }] })
  })

  it('refuse URLs in a field without externalUrls(), and read one written there by SQL as missing', async () => {
    fixture = await createFilesFixture()
    expect((await createProduct({ image: photo })).body).toMatchObject({ errors: [{ field: 'image', message: 'Not a file uploaded for this field; upload it with :upload first' }] })
    const created = await createProduct({})
    await sql`update products set image = ${photo} where id = ${created.body.id}`.execute(fixture.db)
    expect((await call(`/api/v1/products/${created.body.id}`, { headers: as(1) })).body.image).toEqual({ uri: photo, missing: true })
  })

  it('schedule the delete of an upload a URL replaced, and nothing for a URL an upload replaced', async () => {
    fixture = await createFilesFixture({ external: true })
    const first = await upload()
    const created = await createProduct({ image: first })
    const linked = await call(`/api/v1/products/${created.body.id}`, { method: 'PATCH', headers: { ...as(1), 'content-type': 'application/json', 'if-match': created.headers.get('etag')! }, body: JSON.stringify({ image: photo }) })
    expect(linked.body.image.url).toBe(photo)
    expect(await fixture.scheduled('private')).toBe(2)
    expect((await fixture.cleanup.run(new Date(Date.now() + 2 * day))).deleted).toEqual([first.slice(0, first.indexOf('?'))])

    const replaced = await call(`/api/v1/products/${created.body.id}`, { method: 'PATCH', headers: { ...as(1), 'content-type': 'application/json', 'if-match': linked.headers.get('etag')! }, body: JSON.stringify({ image: await upload() }) })
    expect(replaced.status).toBe(200)
    expect(await fixture.scheduled('private')).toBe(1)
  })
})

describe('trusted image hosts', () => {
  it('name the hosts public providers link from and those the config adds in /meta', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'protobase-files-'))
    fixture = await createFilesFixture({
      providers: { private: localFiles({ dir: path.join(dir, 'private') }), public: localFiles({ dir: path.join(dir, 'public'), public: true, publicUrl: 'https://files.acme.example/app' }) },
      trustedHosts: ['images.example.com'],
    })
    const meta = await call('/api/meta', { headers: as(1) })
    expect(meta.body.files).toEqual({ trustedHosts: ['files.acme.example', 'images.example.com'] })
    await rm(dir, { recursive: true, force: true })
  })

  it('leave them out of /meta when there are none', async () => {
    fixture = await createFilesFixture()
    expect((await call('/api/meta', { headers: as(1) })).body.files).toBeUndefined()
  })
})
