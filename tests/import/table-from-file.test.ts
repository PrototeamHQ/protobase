import { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient } from '@protobase/client'
import { createAdmin } from '../../packages/server/src/create-admin'
import { readDefinitionsVersion } from '../../packages/server/src/user-tables/definitions-version'
import { reloadingAdmin } from '../../packages/server/src/user-tables/reloading-admin'
import { userTablesMigration } from '../../packages/server/src/user-tables/schema'
import { userTableResources } from '../../packages/server/src/user-tables/user-table-resources'
import { createLookups } from '../../packages/ui/src/app/import/lookups'
import { createTableOps } from '../../packages/ui/src/app/import/new-table/create-table-ops'
import { readColumns } from '../../packages/ui/src/app/import/new-table/read-columns'
import { changeField, includedFields, proposeTable } from '../../packages/ui/src/app/import/new-table/table-proposal'
import { runImport } from '../../packages/ui/src/app/import/run-import'
import { memorySheetSource } from '../../packages/ui/src/app/import/sheet-source'
import { as, testAuthenticator } from '../../test-support/server'
import { openSnapshotDb, type SnapshotDb } from '../../test-support/sql-snapshot'

// A file made into a table through the real API: the table and its fields in one batch, then the rows as Import writes
// them, each field filterable on the list
describe('a table from a file', () => {
  let pg: SnapshotDb
  let db: Kysely<any>
  let client: ReturnType<typeof createClient>

  beforeAll(async () => {
    pg = await openSnapshotDb('empty')
    db = new Kysely({ dialect: pg.dialect })
    await pg.exec((await userTablesMigration(db))!)
    const build = (tables: Awaited<ReturnType<typeof userTableResources>>) => createAdmin({ resources: [], userTables: tables, db, authenticate: testAuthenticator, options: {} })
    const app = reloadingAdmin({ first: build(await userTableResources(db)), version: await readDefinitionsVersion(db), readVersion: () => readDefinitionsVersion(db), readTables: () => userTableResources(db), build })
    client = createClient({ baseUrl: 'http://localhost/api/v1', fetch: async (input, init) => app.request(String(input), { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), ...as(1, 'admin') } }) })
  })
  afterAll(async () => {
    await db.destroy()
  })

  const source = memorySheetSource([
    { line: 1, cells: ['Name', 'Visits', 'Price', 'Joined', 'ID'] },
    { line: 2, cells: ['Hoogland Fietsen', '12', '1.5', '2026-03-01', '007'] },
    { line: 3, cells: ['De Spaak', '-3', '20', '2026-03-02', '008'] },
    { line: 4, cells: ['Rijnland', '', '', '', '009'] },
  ])

  it('proposes typed fields, makes the table in one request and writes the rows, each field filterable', async () => {
    const read = await readColumns(source, undefined, () => {})
    let proposal = proposeTable('Trade fair.csv', read, [], 63)
    expect(proposal.fields.map((field) => [field.name, field.type])).toEqual([
      ['name', 'text'],
      ['visits', 'integer'],
      ['price', 'decimal'],
      ['joined', 'date'],
      ['id_2', 'text'],
    ])
    proposal = changeField({ ...proposal, singularLabel: 'Contact' }, 4, { include: false })

    const { results } = await client.batchWrite(createTableOps('user_tables', proposal))
    const table = String(results[0]!.op === 'create' && results[0]!.record.table_name)
    expect(table).toBe('trade_fair')

    const meta = await client.meta()
    if (meta.status !== 'modified') throw new Error('The first /meta has no ETag to match')
    const model = meta.meta.resources.find((resource) => resource.name === table)!
    const plan = { mode: 'create' as const, columns: includedFields(proposal).map((field) => ({ column: field.column, field: field.name })), options: { decimal: '.' as const, dateOrder: 'dmy' as const, booleanText: true } }
    const context = { model, resources: { [table]: model }, views: {}, lookups: createLookups(() => client) }
    const result = await runImport(source, undefined, plan, context, { client, onProgress: () => {}, cancelled: () => false })
    expect(result).toMatchObject({ created: 3, skipped: 0, failed: 0, cancelled: false })

    const names = async (filter: string) => (await client.list(table, { filter, orderBy: 'name' })).items.map((item) => item.name)
    expect(await names('name = "De Spaak"')).toEqual(['De Spaak'])
    expect(await names('visits < 0')).toEqual(['De Spaak'])
    expect(await names('price = 1.5')).toEqual(['Hoogland Fietsen'])
    expect(await names('joined >= "2026-03-02"')).toEqual(['De Spaak'])
  })

  it('leaves no table behind when a field is refused', async () => {
    const read = await readColumns(source, undefined, () => {})
    const proposal = changeField({ ...proposeTable('refused.csv', read, [], 63), singularLabel: 'Row' }, 0, { name: 'select' })
    await expect(client.batchWrite(createTableOps('user_tables', proposal))).rejects.toThrow()
    expect((await client.list('user_tables', { filter: 'name = "refused"' })).items).toEqual([])
  })
})
