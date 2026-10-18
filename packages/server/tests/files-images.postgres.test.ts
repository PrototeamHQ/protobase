import sharp from 'sharp'
import { afterEach, describe, expect, it } from 'vitest'
import { openPostgresDatabase, postgresTemplateReady } from '../../../test-support/postgres-database'
import { as, json } from '../../../test-support/server'
import { pdf } from '../src/files/testing/samples'
import { createFilesFixture, type ProductOptions } from './support/files-fixture'

// On real Postgres, not a recording: libvips computes the placeholder that goes into the database a little differently
// on each CPU architecture, so a recording made on one fails replay on another.
const database = () => openPostgresDatabase('empty')

let fixture: Awaited<ReturnType<typeof createFilesFixture>>
afterEach(() => fixture.close())

const day = 86_400_000

// A 300×200 photo whose EXIF data says to turn it a quarter, so it is shown 200×300.
const photo = new Uint8Array(await sharp({ create: { width: 300, height: 200, channels: 3, background: '#c04020' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer())

const variants: ProductOptions['variants'] = { card: { width: 120, height: 90, fit: 'cover', format: 'webp', quality: 70 }, thumb: { width: 40, format: 'avif' } }

const upload = async (body: Uint8Array<ArrayBuffer>, name: string) => {
  const response = await fixture.app.request(`/api/v1/products:upload?field=image&name=${name}`, { method: 'POST', headers: as(1), body })
  return { status: response.status, body: await response.json() }
}

const call = async (path: string, init: RequestInit = {}) => {
  const response = await fixture.app.request(path, init)
  return { status: response.status, body: await response.json(), headers: response.headers }
}

const download = async (url: string) => {
  const response = await fixture.app.request(url)
  const { width, height, format } = await sharp(new Uint8Array(await response.arrayBuffer())).metadata()
  return { status: response.status, type: response.headers.get('content-type'), width, height, format }
}

describe.skipIf(!(await postgresTemplateReady('empty')))('image fields', () => {
  it('store the variants beside the upload, upright, and give the placeholder and each variant a link', async () => {
    fixture = await createFilesFixture({ database, accept: ['image/*', 'application/pdf'], placeholder: true, variants })
    const uploaded = await upload(photo, 'roof.jpg')
    expect(uploaded.status).toBe(201)
    expect(uploaded.body.value).toMatch(/^private:1\/[0-9a-f-]{36}\.jpg\?name=roof\.jpg&size=\d+&variants=card\.webp%2Cthumb\.avif&/)
    expect(uploaded.body.derived).toEqual({ imagePlaceholder: expect.stringMatching(/^[A-Za-z0-9+/=]{20,60}$/) })

    const created = await call('/api/v1/products', json({ name: 'House', image: uploaded.body.value }, as(1)))
    expect(created.status).toBe(201)
    expect(created.body.imagePlaceholder).toBe(uploaded.body.derived.imagePlaceholder)
    const image = created.body.image
    expect(image).toMatchObject({ name: 'roof.jpg', type: 'image/jpeg', placeholder: created.body.imagePlaceholder })
    expect(image.variants).toEqual({
      card: { url: expect.stringMatching(/^\/api\/files\/private\/1\/.+\.jpg\.card\.webp\?r=products&k=\d+&f=image&/), type: 'image/webp', width: 120, height: 90 },
      thumb: { url: expect.stringMatching(/\.jpg\.thumb\.avif\?/), type: 'image/avif', width: 40 },
    })
    expect(await download(image.variants.card.url)).toEqual({ status: 200, type: 'image/webp', width: 120, height: 90, format: 'webp' })
    expect(await download(image.variants.thumb.url)).toEqual({ status: 200, type: 'image/avif', width: 40, height: 60, format: 'heif' })
    expect(await download(image.url)).toMatchObject({ status: 200, type: 'image/jpeg', width: 300, height: 200 })
    // A link signed for one variant opens only that one
    expect((await fixture.app.request(image.variants.card.url.replace('.card.webp', '.thumb.avif'))).status).toBe(403)

    // Another file than an image gets neither
    const scan = await upload(pdf, 'plan.pdf')
    expect(scan.body.value).not.toContain('variants=')
    expect(scan.body.derived).toEqual({ imagePlaceholder: null })
  })

  it('delete the variants with their file, and keep them while it is referenced', async () => {
    fixture = await createFilesFixture({ database, placeholder: true, variants })
    const first = (await upload(photo, 'a.jpg')).body.value
    const created = await call('/api/v1/products', json({ name: 'House', image: first }, as(1)))
    expect(await fixture.stored('private')).toHaveLength(3)
    const oldCard = created.body.image.variants.card.url

    const second = (await upload(photo, 'b.jpg')).body.value
    const replaced = await call(`/api/v1/products/${created.body.id}`, { method: 'PATCH', headers: { ...as(1), 'content-type': 'application/json', 'if-match': created.headers.get('etag')! }, body: JSON.stringify({ image: second }) })
    expect(replaced.status).toBe(200)
    expect((await fixture.app.request(oldCard)).status).toBe(404)
    expect(await fixture.stored('private')).toHaveLength(6)

    const report = await fixture.cleanup.run(new Date(Date.now() + 2 * day))
    expect(report.deleted).toEqual([first.slice(0, first.indexOf('?'))])
    const kept = second.slice('private:'.length, second.indexOf('?'))
    expect(await fixture.stored('private')).toEqual([kept, `${kept}.card.webp`, `${kept}.thumb.avif`])
  })

  it('store the original as declared instead of the upload', async () => {
    fixture = await createFilesFixture({ database, variants: { card: { width: 60, format: 'webp' } }, original: { width: 150, format: 'webp', quality: 80 } })
    const uploaded = await upload(photo, 'roof.jpg')
    expect(uploaded.body.value).toMatch(/^private:1\/[0-9a-f-]{36}\.webp\?name=roof\.jpg&size=\d+&variants=card\.webp&/)
    expect(uploaded.body.file).toMatchObject({ name: 'roof.jpg', type: 'image/webp' })

    const created = await call('/api/v1/products', json({ name: 'House', image: uploaded.body.value }, as(1)))
    expect(created.body.image).toMatchObject({ type: 'image/webp', size: uploaded.body.file.size })
    expect(await download(created.body.image.url)).toEqual({ status: 200, type: 'image/webp', width: 150, height: 225, format: 'webp' })
    const path = uploaded.body.value.slice('private:'.length, uploaded.body.value.indexOf('?'))
    expect(await fixture.stored('private')).toEqual([path, `${path}.card.webp`])
  })
})
