import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { aspectRatio, imageSize } from '@protobase/server'
import { as, json } from '../../../test-support/server'
import { jpeg, pdf, png } from '../src/files/testing/samples'
import { createFilesFixture } from './support/files-fixture'

let fixture: Awaited<ReturnType<typeof createFilesFixture>>
beforeEach(async () => {
  fixture = await createFilesFixture({ accept: ['image/*', 'application/pdf'], derive: { imageWidth: imageSize('width'), imageRatio: aspectRatio() } })
})
afterEach(() => fixture.close())

const upload = async (body: Uint8Array<ArrayBuffer>, name: string) => {
  const response = await fixture.app.request(`/api/v1/products:upload?field=image&name=${name}`, { method: 'POST', headers: as(1), body })
  return response.json()
}

const update = async (id: number, body: unknown) => {
  const current = await fixture.app.request(`/api/v1/products/${id}`, { headers: as(1) })
  const response = await fixture.app.request(`/api/v1/products/${id}`, { method: 'PATCH', headers: { ...as(1), 'content-type': 'application/json', 'if-match': current.headers.get('etag')! }, body: JSON.stringify(body) })
  return { status: response.status, body: await response.json() }
}

describe('derived fields', () => {
  it('are computed at upload and written with the file, recomputed on replace and cleared with it', async () => {
    const photo = await upload(jpeg, 'bike.jpg')
    expect(photo.derived).toEqual({ imageWidth: 6000, imageRatio: '1.5000' })
    const created = await (await fixture.app.request('/api/v1/products', json({ name: 'Bike', image: photo.value }, as(1)))).json()
    expect(created).toMatchObject({ imageWidth: 6000, imageRatio: '1.5000' })

    const square = await update(created.id, { image: (await upload(png, 'dot.png')).value })
    expect(square.body).toMatchObject({ imageWidth: 1, imageRatio: '1.0000' })

    // A PDF is no image: the image processors leave their fields empty
    const scan = await update(created.id, { image: (await upload(pdf, 'scan.pdf')).value })
    expect(scan.body).toMatchObject({ image: { type: 'application/pdf' }, imageWidth: null, imageRatio: null })

    await update(created.id, { image: (await upload(jpeg, 'bike.jpg')).value })
    expect((await update(created.id, { image: null })).body).toMatchObject({ image: null, imageWidth: null, imageRatio: null })
  })

  it('cannot be written by a client, nor smuggled in a ticket', async () => {
    const photo = await upload(jpeg, 'bike.jpg')
    const written = await (await fixture.app.request('/api/v1/products', json({ name: 'Bike', image: photo.value, imageWidth: 1 }, as(1)))).json()
    expect(written).toMatchObject({ errors: [{ field: 'imageWidth', code: 'read-only' }] })
    const forged = await (await fixture.app.request('/api/v1/products', json({ name: 'Bike', image: photo.value.replace('d.imageWidth=6000', 'd.imageWidth=1') }, as(1)))).json()
    expect(forged).toMatchObject({ errors: [{ field: 'image', code: 'invalid-value' }] })
  })
})
