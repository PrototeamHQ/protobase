import { afterEach, describe, expect, it } from 'vitest'
import { limitedFileStore, s3FileStore, type FileProvider } from '@protobase/server'
import { as, json } from '../../../test-support/server'
import { fakeBucket } from '../src/files/testing/fake-bucket'
import { jpeg, png } from '../src/files/testing/samples'
import { createFilesFixture } from './support/files-fixture'

let fixture: Awaited<ReturnType<typeof createFilesFixture>>
afterEach(() => fixture.close())

// Both providers in one bucket, as a platform would set them up: one prefix each, public files on the bucket's domain.
const bucketFixture = async (limits: { maxFiles?: number } = {}) => {
  const { bucket, objects } = fakeBucket()
  const providers: Record<string, FileProvider> = {
    private: { store: limitedFileStore(s3FileStore(bucket, 'app/private'), limits), public: false },
    public: { store: s3FileStore(bucket, 'app/public'), public: true, publicUrl: 'https://files.example.com/app/public' },
  }
  fixture = await createFilesFixture({ providers })
  return objects
}

const upload = async (resource: string, field: string, body: Uint8Array<ArrayBuffer>, name: string, headers: Record<string, string>) => {
  const response = await fixture.app.request(`/api/v1/${resource}:upload?field=${field}&name=${name}`, { method: 'POST', headers: { ...headers, 'content-type': 'application/octet-stream' }, body })
  return { status: response.status, body: await response.json() }
}

const create = async (path: string, data: Record<string, unknown>, headers: Record<string, string>) => (await fixture.app.request(path, json(data, headers))).json()

describe('file fields in a bucket', () => {
  it('store uploads in the bucket, and redirect a private download to a presigned link once the row is checked', async () => {
    const objects = await bucketFixture()
    const uploaded = await upload('products', 'image', jpeg, 'photo.png', as(1))
    expect(uploaded.status).toBe(201)
    const product = await create('/api/v1/products', { name: 'Bike', image: uploaded.body.value }, as(1))
    const path = product.image.uri.slice('private:'.length, product.image.uri.indexOf('?'))
    expect(objects.get(`app/private/${path}`)?.bytes).toEqual(jpeg)

    const download = await fixture.app.request(product.image.url)
    expect(download.status).toBe(302)
    const location = new URL(download.headers.get('location')!)
    expect(location.pathname).toBe(`/app/private/${path}`)
    expect(location.searchParams.get('response-content-type')).toBe('image/jpeg')
    expect(location.searchParams.get('response-content-disposition')).toBe(`inline; filename="photo.jpg"; filename*=UTF-8''photo.jpg`)
    expect(download.headers.get('cache-control')).toMatch(/^private, max-age=\d+$/)
    expect((await fixture.app.request(product.image.url.replace(/sig=[\w-]+/, 'sig=x'))).status).toBe(403)

    const replaced = await upload('products', 'image', jpeg, 'other.jpg', as(1))
    const etag = (await fixture.app.request(`/api/v1/products/${product.id}`, { headers: as(1) })).headers.get('etag')!
    await fixture.app.request(`/api/v1/products/${product.id}`, { method: 'PATCH', headers: { ...as(1), 'content-type': 'application/json', 'if-match': etag }, body: JSON.stringify({ image: replaced.body.value }) })
    expect((await fixture.app.request(product.image.url)).status).toBe(404)
  })

  it('link public files from the bucket\'s own address', async () => {
    const objects = await bucketFixture()
    const avatar = await create('/api/v1/avatars', { name: 'me', picture: (await upload('avatars', 'picture', png, 'me.png', as(undefined))).body.value }, as(undefined))
    expect(avatar.picture.url).toMatch(/^https:\/\/files\.example\.com\/app\/public\/_\/[0-9a-f-]{36}\.png$/)
    expect(objects.get(`app/public/${avatar.picture.url.slice('https://files.example.com/app/public/'.length)}`)?.type).toBe('image/png')
  })

  it('answer an upload past the provider\'s limit with 507', async () => {
    await bucketFixture({ maxFiles: 1 })
    expect((await upload('products', 'image', jpeg, 'one.jpg', as(1))).status).toBe(201)
    expect(await upload('products', 'image', jpeg, 'two.jpg', as(1))).toMatchObject({ status: 507, body: { title: 'Insufficient Storage' } })
  })
})
