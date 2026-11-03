import { expect, test } from 'vitest'
import type { Deps } from '../deps'
import { openApiDocument } from '../openapi/document'
import { docsRoutes } from './docs'

test('the OpenAPI document is titled with the app name', () => {
  expect(openApiDocument([], '/api/v1', 'Shop & Co').info.title).toBe('Shop & Co API')
})

test('the API reference page is titled with the app name', async () => {
  const deps = { registry: { entries: [] }, basePath: '/api/v1' } as unknown as Deps
  const page = await (await docsRoutes(deps, 'Shop & Co').request('/docs')).text()
  expect(page).toMatch(/<title>Shop (&|&amp;) Co API<\/title>/)
  expect(page).not.toContain('Protobase API')
})
