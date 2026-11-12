import { afterEach, describe, expect, it } from 'vitest'
import { sql } from 'kysely'
import { as, json } from '../../../test-support/server'
import { png } from '../src/files/testing/samples'
import { createFilesFixture } from './support/files-fixture'

const reportType = 'application/vnd.example.report+json'
const report = new TextEncoder().encode('{"title":"Weekly"}')

let fixture: Awaited<ReturnType<typeof createFilesFixture>>
afterEach(() => fixture.close())

const call = async (path: string, init: RequestInit = {}) => {
  const response = await fixture.app.request(path, init)
  return { status: response.status, body: await response.json() }
}

const upload = async (name: string, body: BodyInit) => {
  const response = await fixture.app.request(`/api/v1/products:upload?field=image&name=${encodeURIComponent(name)}`, { method: 'POST', headers: as(1), body })
  return (await response.json()).value as string
}

const columns = async (id: number) => (await sql<{ image_type: string | null; image_size: string | null }>`select image_type, image_size from products where id = ${id}`.execute(fixture.db)).rows[0]

describe('the type and size fields of a file field', () => {
  it('hold the type and size of each upload, and are cleared with the file', async () => {
    fixture = await createFilesFixture({ typeAndSize: true })
    const created = await call('/api/v1/products', json({ name: 'Bike', image: await upload('a.png', png) }, as(1)))
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({ imageType: 'image/png', imageSize: String(png.length), image: { type: 'image/png', size: png.length } })
    expect(await columns(created.body.id)).toEqual({ image_type: 'image/png', image_size: String(png.length) })

    const cleared = await call(`/api/v1/products/${created.body.id}`, { method: 'PATCH', headers: { ...as(1), 'content-type': 'application/json', 'if-match': '*' }, body: JSON.stringify({ image: null }) })
    expect(cleared.body).toMatchObject({ image: null, imageType: null, imageSize: null })
  })

  it('serve and describe a file by the type its type field holds, such as one an import wrote', async () => {
    fixture = await createFilesFixture({ typeAndSize: true, accept: [], types: { [reportType]: ['report.json'] } })
    const created = await call('/api/v1/products', json({ name: 'Bike', image: await upload('weekly.report.json', report) }, as(1)))
    expect(created.body.imageType).toBe(reportType)

    // An import stored the file under a plain name, and wrote its type beside it
    const plain = created.body.image.uri.replace('.report.json?', '.bin?')
    await sql`update products set image = ${plain}, image_type = ${reportType}, image_size = null where id = ${created.body.id}`.execute(fixture.db)
    const read = await call(`/api/v1/products/${created.body.id}`, { headers: as(1) })
    expect(read.body.image).toMatchObject({ type: reportType, size: report.length })
  })

  it('serve a download as the type its type field holds only when the app knows that type', async () => {
    fixture = await createFilesFixture({ typeAndSize: true, accept: [] })
    const created = await call('/api/v1/products', json({ name: 'Bike', image: await upload('notes.txt', report) }, as(1)))
    await sql`update products set image_type = 'application/json' where id = ${created.body.id}`.execute(fixture.db)
    const typed = await call(`/api/v1/products/${created.body.id}`, { headers: as(1) })
    expect((await fixture.app.request(typed.body.image.url)).headers.get('content-type')).toBe('application/json')

    await sql`update products set image_type = 'text/html' where id = ${created.body.id}`.execute(fixture.db)
    const html = await call(`/api/v1/products/${created.body.id}`, { headers: as(1) })
    expect(html.body.image.type).toBe('text/html')
    expect((await fixture.app.request(html.body.image.url)).headers.get('content-type')).toBe('text/plain')
  })

  it("type an external URL by the app's own types, and leave its size unknown", async () => {
    fixture = await createFilesFixture({ typeAndSize: true, external: true, accept: [], types: { [reportType]: ['report.json'] } })
    const url = 'https://reports.example.com/weekly.report.json'
    const created = await call('/api/v1/products', json({ name: 'Bike', image: url }, as(1)))
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({ imageType: reportType, imageSize: null, image: { uri: url, name: 'weekly.report.json', type: reportType, url } })
    expect(created.body.image.size).toBeUndefined()

    const unknown = await call('/api/v1/products', json({ name: 'Car', image: 'https://reports.example.com/weekly' }, as(1)))
    expect(unknown.body).toMatchObject({ imageType: null, imageSize: null, image: { type: 'application/octet-stream' } })
  })
})
