import { Validator } from '@seriousme/openapi-schema-validator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'kysely'
import { as, json } from '../../../test-support/server'
import { jpeg, pdf, png } from '../src/files/testing/samples'
import { createFilesFixture } from './support/files-fixture'

let fixture: Awaited<ReturnType<typeof createFilesFixture>>
beforeEach(async () => {
  fixture = await createFilesFixture()
})
afterEach(() => fixture.close())

const day = 86_400_000

const upload = async (resource: string, field: string, body: Uint8Array<ArrayBuffer>, name: string, headers: Record<string, string> = as(1), type = 'application/octet-stream') => {
  const response = await fixture.app.request(`/api/v1/${resource}:upload?field=${field}&name=${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { ...headers, 'content-type': type },
    body,
  })
  return { status: response.status, body: await response.json() }
}

const call = async (path: string, init: RequestInit = {}) => {
  const response = await fixture.app.request(path, init)
  return { status: response.status, body: await response.json(), headers: response.headers }
}

const patch = (path: string, body: unknown, etag: string) => call(path, { method: 'PATCH', headers: { ...as(1), 'content-type': 'application/json', 'if-match': etag }, body: JSON.stringify(body) })

const createProduct = async (data: Record<string, unknown>) => call('/api/v1/products', json({ name: 'Bike', ...data }, as(1)))

describe('file fields', () => {
  it('upload, attach, read and download a file, typed by its content', async () => {
    const uploaded = await upload('products', 'image', jpeg, 'photo.png', as(1), 'image/png')
    expect(uploaded.status).toBe(201)
    expect(uploaded.body).toMatchObject({ file: { name: 'photo.png', type: 'image/jpeg', size: jpeg.length }, derived: {}, corrected: { from: 'image/png', to: 'image/jpeg' } })
    expect(uploaded.body.value).toMatch(/^private:1\/[0-9a-f-]{36}\.jpg\?name=photo\.png&size=\d+&exp=\d+&sig=/)

    const created = await createProduct({ image: uploaded.body.value })
    expect(created.status).toBe(201)
    const uri = uploaded.body.value.slice(0, uploaded.body.value.indexOf('&exp='))
    expect(created.body.image).toEqual({ uri, name: 'photo.png', type: 'image/jpeg', size: jpeg.length, url: expect.stringMatching(/^\/api\/files\/private\/1\/.+\.jpg\?r=products&k=\d+&f=image&exp=\d+&sig=/) })
    const stored = await sql<{ image: string }>`select image from products where id = ${created.body.id}`.execute(fixture.db)
    expect(stored.rows[0]!.image).toBe(uri)

    const read = await call(`/api/v1/products/${created.body.id}`, { headers: as(1) })
    expect(read.body.image).toEqual(created.body.image)
    expect(read.headers.get('etag')).toBe(created.headers.get('etag'))
    const listed = await call('/api/v1/products?fields=image', { headers: as(1) })
    expect(listed.body.items[0].image.url).toBe(created.body.image.url)

    // The signed URL is the permission: no token needed, as for an <img src>
    const download = await fixture.app.request(created.body.image.url)
    expect(download.status).toBe(200)
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(jpeg)
    expect(Object.fromEntries(['content-type', 'content-disposition', 'x-content-type-options', 'content-security-policy'].map((name) => [name, download.headers.get(name)]))).toEqual({
      'content-type': 'image/jpeg',
      'content-disposition': `inline; filename="photo.jpg"; filename*=UTF-8''photo.jpg`,
      'x-content-type-options': 'nosniff',
      'content-security-policy': "sandbox; default-src 'none'",
    })
    const partial = await fixture.app.request(created.body.image.url, { headers: { range: 'bytes=0-3' } })
    expect(partial.status).toBe(206)
    expect(partial.headers.get('content-range')).toBe(`bytes 0-3/${jpeg.length}`)
    expect(new Uint8Array(await partial.arrayBuffer())).toEqual(jpeg.slice(0, 4))
    expect((await fixture.app.request(created.body.image.url.replace(/sig=[\w-]+/, 'sig=x'))).status).toBe(403)
  })

  it('refuse a type the field does not take, a file too large, and values that are no ticket for this field and caller', async () => {
    expect(await upload('products', 'image', pdf, 'scan.pdf')).toMatchObject({ status: 415, body: { type: 'urn:protobase:problem:unsupported-type', detail: 'This field takes image/*; the file is application/pdf' } })
    expect((await upload('products', 'image', new Uint8Array(70_000).fill(1), 'big.png')).status).toBe(413)
    expect((await upload('products', 'name', png, 'a.png')).status).toBe(400)
    expect(await fixture.stored('private')).toEqual([])

    const ticket = (await upload('products', 'image', png, 'a.png')).body.value
    const refused = async (data: Record<string, unknown>, headers = as(1)) => (await call('/api/v1/products', json({ name: 'Bike', ...data }, headers))).body
    expect(await refused({ image: ticket.slice(0, ticket.indexOf('&exp=')) })).toMatchObject({ errors: [{ field: 'image', code: 'invalid-value' }] })
    expect(await refused({ datasheet: ticket })).toMatchObject({ errors: [{ field: 'datasheet' }] })
    expect(await refused({ image: ticket }, as(2))).toMatchObject({ errors: [{ field: 'image', message: 'Not a file uploaded for this field; upload it with :upload first' }] })
    expect(await refused({ image: 'public:images/test.jpg' })).toMatchObject({ errors: [{ field: 'image' }] })
    expect(await refused({ image: { uri: 'x' } })).toMatchObject({ errors: [{ field: 'image', code: 'invalid-value' }] })
  })

  it('schedule the delete of a replaced or cleared file, and keep the current one', async () => {
    const first = (await upload('products', 'image', png, 'a.png')).body.value
    const created = await createProduct({ image: first })
    const oldUrl = created.body.image.url
    const second = (await upload('products', 'image', jpeg, 'b.jpg')).body.value
    const replaced = await patch(`/api/v1/products/${created.body.id}`, { image: second }, created.headers.get('etag')!)
    expect(replaced.status).toBe(200)
    // The old link stops working at once: its row no longer holds that file
    expect((await fixture.app.request(oldUrl)).status).toBe(404)
    // Sending the stored value back changes nothing
    expect((await patch(`/api/v1/products/${created.body.id}`, { image: replaced.body.image.uri }, replaced.headers.get('etag')!)).status).toBe(200)
    expect(await fixture.stored('private')).toHaveLength(2)

    // Within the retention period both stay; after it, the replaced one goes and the current one stays
    expect(await fixture.cleanup.run(new Date(Date.now() + day / 2))).toEqual({ deleted: [], kept: [] })
    const later = await fixture.cleanup.run(new Date(Date.now() + 2 * day))
    expect(later.deleted).toEqual([first.slice(0, first.indexOf('?'))])
    expect(later.kept).toEqual([second.slice(0, second.indexOf('?'))])
    expect(await fixture.stored('private')).toHaveLength(1)
    expect(await fixture.scheduled('private')).toBe(0)

    const cleared = await patch(`/api/v1/products/${created.body.id}`, { image: null }, replaced.headers.get('etag')!)
    expect(cleared.body.image).toBeNull()
    expect(await fixture.scheduled('private')).toBe(1)
    expect((await fixture.cleanup.run(new Date(Date.now() + 2 * day))).deleted).toHaveLength(1)
    expect(await fixture.stored('private')).toEqual([])
  })

  it('keep the files of a soft-deleted row, and schedule those of a deleted one', async () => {
    const created = await createProduct({ image: (await upload('products', 'image', png, 'a.png')).body.value })
    await fixture.cleanup.run(new Date(Date.now() + 2 * day))
    expect((await fixture.app.request(`/api/v1/products/${created.body.id}`, { method: 'DELETE', headers: { ...as(1), 'if-match': '*' } })).status).toBe(204)
    expect(await fixture.scheduled('private')).toBe(0)

    const avatar = await call('/api/v1/avatars', json({ name: 'me', picture: (await upload('avatars', 'picture', png, 'me.png', as(undefined))).body.value }, as(undefined)))
    await fixture.cleanup.run(new Date(Date.now() + 2 * day))
    expect((await fixture.app.request(`/api/v1/avatars/${avatar.body.id}`, { method: 'DELETE', headers: { ...as(undefined), 'if-match': '*' } })).status).toBe(204)
    // Public files keep no bytes past their last reference: due at once
    expect((await fixture.cleanup.run()).deleted).toEqual([avatar.body.picture.uri.split('?')[0]])
    expect(await fixture.stored('public')).toEqual([])
  })

  it('delete uploads a rolled-back write or nobody attached once their ticket expired, and nothing referenced', async () => {
    const used = (await upload('products', 'image', png, 'kept.png')).body.value
    const rolledBack = (await upload('products', 'image', png, 'rolled-back.png')).body.value
    await upload('products', 'image', png, 'abandoned.png')
    await createProduct({ image: used })
    const batch = await call('/api/v1:batchWrite', json({ ops: [
      { op: 'create', resource: 'products', data: { name: 'Bike', image: rolledBack } },
      { op: 'create', resource: 'products', data: { name: 'forbidden', image: 'nope' } },
    ] }, as(1)))
    expect(batch.status).toBe(400)
    expect(await fixture.stored('private')).toHaveLength(3)

    expect((await fixture.cleanup.run(new Date(Date.now() + 23 * 3_600_000))).deleted).toEqual([])
    const report = await fixture.cleanup.run(new Date(Date.now() + 2 * day))
    expect(report.deleted).toHaveLength(2)
    expect(report.kept).toEqual([used.slice(0, used.indexOf('?'))])
    expect(await fixture.stored('private')).toEqual([used.slice('private:'.length, used.indexOf('?'))])
  })

  it('never serve a file under another tenant, even when SQL put its URI in a row', async () => {
    const ours = await createProduct({ image: (await upload('products', 'image', png, 'a.png')).body.value })
    const theirs = await call('/api/v1/products', json({ name: 'Other' }, as(2)))
    await sql`update products set image = ${ours.body.image.uri} where id = ${theirs.body.id}`.execute(fixture.db)
    const read = await call(`/api/v1/products/${theirs.body.id}`, { headers: as(2) })
    expect(read.body.image.url).toBeDefined()
    expect((await fixture.app.request(read.body.image.url)).status).toBe(404)
  })

  it('serve public files to anyone at a permanent address, and an unknown value as missing', async () => {
    const avatar = await call('/api/v1/avatars', json({ name: 'me', picture: (await upload('avatars', 'picture', png, 'me.png', as(undefined))).body.value }, as(undefined)))
    expect(avatar.body.picture.url).toMatch(/^\/api\/files\/public\/_\/[0-9a-f-]{36}\.png$/)
    const download = await fixture.app.request(avatar.body.picture.url)
    expect(download.status).toBe(200)
    expect(download.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')

    await sql`update avatars set picture = 'archive:old/me.png' where id = ${avatar.body.id}`.execute(fixture.db)
    expect((await call(`/api/v1/avatars/${avatar.body.id}`, { headers: as(undefined) })).body.picture).toEqual({ uri: 'archive:old/me.png', missing: true })
    expect((await fixture.app.request('/api/files/public/_/../../secret.png')).status).toBe(404)
  })

  it('run the cleanup over HTTP for an admin only', async () => {
    expect((await call('/api/files:cleanup', { method: 'POST', headers: as(1, 'sales') })).status).toBe(403)
    expect(await call('/api/files:cleanup', { method: 'POST', headers: as(1) })).toMatchObject({ status: 200, body: { deleted: [], kept: [] } })
  })

  it('describe the upload method, file objects and ticket bodies in the OpenAPI document', async () => {
    const document = (await call('/api/openapi.json', { headers: as(1) })).body
    const result = await new Validator().validate(document)
    expect(result.valid, JSON.stringify((result as { errors?: unknown }).errors)).toBe(true)
    expect(document.paths['/products:upload'].post.parameters[0].schema.enum).toEqual(['image', 'datasheet'])
    expect(document.components.schemas.Products.properties.image).toEqual({ anyOf: [{ $ref: '#/components/schemas/File' }, { type: 'null' }] })
    expect(document.components.schemas.ProductsCreate.properties.image.description).toContain('POST /products:upload?field=image')
    expect(document.components.schemas.File.required).toEqual(['uri'])
    expect((await call('/api/meta', { headers: as(1) })).body.resources.find((model: { name: string }) => model.name === 'products').fields.image.file).toEqual({ accept: ['image/*'], maxSize: 64_000, provider: 'private' })
  })
})
