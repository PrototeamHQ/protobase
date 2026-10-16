import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient } from '@protobase/client'
import { allResources, as, createFixtureDb, createTestApp } from '../../test-support/server'
import { createLookups } from '../../packages/ui/src/app/import/lookups'
import { checkImport, runImport } from '../../packages/ui/src/app/import/run-import'
import { memorySheetSource } from '../../packages/ui/src/app/import/sheet-source'
import type { ImportContext, ImportPlan } from '../../packages/ui/src/app/import/prepare-rows'

// The import's engine against the real API: batch writes with the server's validation and access, and its lookups
describe('importing rows through the API', () => {
  let fixture: Awaited<ReturnType<typeof createFixtureDb>>
  let client: ReturnType<typeof createClient>

  beforeAll(async () => {
    fixture = await createFixtureDb()
    const app = createTestApp(fixture)
    const headers = as(1)
    client = createClient({ baseUrl: 'http://localhost/api/v1', fetch: async (input, init) => app.request(String(input), { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), ...headers } }) })
  })
  afterAll(async () => {
    await fixture.db.destroy()
  })

  const models = Object.fromEntries(allResources.map((resource) => [resource.toModel().name, resource.toModel()]))
  const context = (): ImportContext => ({ model: models.companies!, resources: models, views: {}, lookups: createLookups(() => client) })
  const plan: ImportPlan = {
    mode: 'upsert',
    columns: [
      { column: 0, field: 'name' },
      { column: 1, field: 'status' },
      { column: 2, field: 'revenue' },
    ],
    match: { column: 0, field: 'name' },
    options: { decimal: '.', dateOrder: 'dmy' },
  }
  const source = memorySheetSource([
    { line: 1, cells: ['Name', 'Status', 'Revenue'] },
    { line: 2, cells: ['Imported Ltd', 'won', '1,250.50'] },
    { line: 3, cells: ['Company 7', 'lost', '12'] },
    { line: 4, cells: ['forbidden', 'open', '1'] },
    { line: 5, cells: ['Other Ltd', 'pending', '1'] },
  ])

  it('checks every row, then creates and updates in batches, setting aside the row the server refuses', async () => {
    const check = await checkImport(source, undefined, plan, context(), () => {})
    expect(check).toMatchObject({ rows: 4, creates: 2, updates: 1 })
    expect(check.problems.map((row) => [row.line, row.problems])).toEqual([[5, ['Status: “pending” is not one of open, won, lost']]])

    const result = await runImport(source, undefined, plan, context(), { client, onProgress: () => {}, cancelled: () => false })
    expect(result).toMatchObject({ created: 1, updated: 1, skipped: 1, failed: 1, cancelled: false })
    expect(result.notWritten.map((row) => [row.line, row.problems])).toEqual([
      [5, ['Status: “pending” is not one of open, won, lost']],
      [4, ['Name: That name is not allowed']],
    ])

    const stored = await client.list('companies', { filter: 'in(name, "Imported Ltd", "Company 7", "forbidden")', fields: ['name', 'status', 'revenue', 'organizationId'] })
    expect(stored.items.map(({ name, status, revenue, organizationId }) => ({ name, status, revenue, organizationId })).sort((a, b) => String(a.name).localeCompare(String(b.name)))).toEqual([
      { name: 'Company 7', status: 'lost', revenue: '12.00', organizationId: 1 },
      { name: 'Imported Ltd', status: 'won', revenue: '1250.50', organizationId: 1 },
    ])
  })
})
