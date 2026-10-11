import { Validator } from '@seriousme/openapi-schema-validator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createFixtureDb, createTestApp, as, type TestApp } from '../../../test-support/server'

let fixture: Awaited<ReturnType<typeof createFixtureDb>>
let app: TestApp
beforeAll(async () => {
  fixture = await createFixtureDb()
  app = createTestApp(fixture)
})
afterAll(async () => { await fixture.db.destroy() })

describe('GET /openapi.json', () => {
  it('is a valid OpenAPI 3.1 document', async () => {
    const response = await app.request('/api/openapi.json', { headers: as(1) })
    const document = await response.json()
    const result = await new Validator().validate(document)
    expect(result.valid, JSON.stringify((result as { errors?: unknown }).errors)).toBe(true)
    expect(document.openapi).toBe('3.1.0')
  })

  it('has the paths of every resource and the documented filter syntax', async () => {
    const document = await (await app.request('/api/openapi.json', { headers: as(1) })).json()
    expect(Object.keys(document.paths)).toEqual(expect.arrayContaining([
      '/meta', '/companies', '/companies:search', '/companies/{key}', '/companies:facets', '/companies:series', '/companies:histogram', '/companies:seek',
      '/lineItems/{key}',
    ]))
    const filter = document.components.parameters.filter
    expect(filter.description).toContain('https://google.aip.dev/160')
    for (const name of ['in(', 'search(', 'similar(', 'regex(', 'isNull(', 'now()']) expect(filter.description).toContain(name)
    expect(document.components.parameters.orderBy.description).toContain('https://google.aip.dev/132')
  })

  it('derives record and body schemas from the zod record schema', async () => {
    const { components } = await (await app.request('/api/openapi.json', { headers: as(1) })).json()
    expect(components.schemas.Companies.properties.status.enum).toEqual(['open', 'won', 'lost'])
    expect(components.schemas.Companies.properties.id.readOnly).toBe(true)
    expect(Object.keys(components.schemas.CompaniesCreate.properties).sort()).toEqual(['meta', 'name', 'notes', 'revenue', 'status'])
    expect(components.schemas.CompaniesCreate.required).toEqual(['name'])
    expect(components.schemas.Problem).toBeDefined()
    expect(components.responses.NotFound.content['application/problem+json']).toBeDefined()
  })

  it('names its servers relative to where it is served, so it is right on any host and prefix', async () => {
    const document = await (await app.request('/api/openapi.json', { headers: as(1) })).json()
    const resolved = (server: { url: string }, path: string) => new URL(`${server.url.replace(/\/$/, '')}${path}`, 'https://api.example.com/api/openapi.json').pathname
    expect(resolved(document.servers[0], '/companies')).toBe('/api/v1/companies')
    expect(resolved(document.paths['/meta'].servers[0], '/meta')).toBe('/api/meta')
    expect(resolved(document.paths['/v1:batchWrite'].servers[0], '/v1:batchWrite')).toBe('/api/v1:batchWrite')
    // On a domain that serves `/api/*` at its root.
    expect(new URL(`${document.servers[0].url}/companies`, 'https://api.example.com/openapi.json').pathname).toBe('/v1/companies')
  })

  it('serves the Scalar reference, which loads the document beside it', async () => {
    const response = await app.request('/api/docs', { headers: as(1) })
    expect(response.status).toBe(200)
    expect(await response.text()).toMatch(/"url":\s*"openapi.json"/)
  })

  it('needs no database access', async () => {
    const quiet = createTestApp({ ...fixture, db: undefined as never })
    expect((await quiet.request('/api/openapi.json', { headers: as(1) })).status).toBe(200)
  })
})
