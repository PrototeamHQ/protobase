import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { as, json } from '../../../test-support/server'
import { createFilesFixture } from './support/files-fixture'

const reportType = 'application/vnd.example.report+json'

let fixture: Awaited<ReturnType<typeof createFilesFixture>>
beforeEach(async () => {
  fixture = await createFilesFixture({ accept: [], types: { [reportType]: ['report.json'] } })
})
afterEach(() => fixture.close())

const report = new TextEncoder().encode('{"title":"Weekly"}')

const upload = async (name: string) => {
  const response = await fixture.app.request(`/api/v1/products:upload?field=image&name=${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { ...as(1), 'content-type': 'application/octet-stream' },
    body: report,
  })
  return { status: response.status, body: await response.json() }
}

describe("the app's own file types", () => {
  it('store, describe and serve a file named with its extension as that type', async () => {
    const uploaded = await upload('weekly.report.json')
    expect(uploaded.status).toBe(201)
    expect(uploaded.body.file).toEqual({ name: 'weekly.report.json', type: reportType, size: report.length })
    expect(uploaded.body.value).toMatch(/^private:1\/[0-9a-f-]{36}\.report\.json\?name=weekly\.report\.json&/)

    const created = await fixture.app.request('/api/v1/products', json({ name: 'Bike', image: uploaded.body.value }, as(1)))
    const body = await created.json()
    expect(body.image).toMatchObject({ name: 'weekly.report.json', type: reportType })

    const download = await fixture.app.request(body.image.url)
    expect(download.status).toBe(200)
    expect(await download.text()).toBe('{"title":"Weekly"}')
    expect(download.headers.get('content-type')).toBe(reportType)
    expect(download.headers.get('content-disposition')).toBe(`attachment; filename="weekly.report.json"; filename*=UTF-8''weekly.report.json`)
  })

  it('keep a plain .json name as JSON', async () => {
    const uploaded = await upload('weekly.json')
    expect(uploaded.body.file.type).toBe('application/json')
  })
})
