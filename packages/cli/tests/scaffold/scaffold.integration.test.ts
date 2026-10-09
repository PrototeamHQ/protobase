import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { databaseReachable, testDatabaseUrl } from '../support/database'
import { runScaffold } from '../../src/scaffold/run'

const url = testDatabaseUrl()

const reachable = await databaseReachable(url)

describe.skipIf(!reachable)('scaffold against the ERP database', () => {
  let configDir: string
  const options = () => ({
    url,
    configDir,
    yes: true,
    dryRun: false,
    ui: ['names', 'list'] as ('names' | 'list')[],
    excludes: ['public', 'auth'],
  })
  const read = (...parts: string[]) => readFile(path.join(configDir, ...parts), 'utf8')
  const run = () => runScaffold(options(), () => {})

  beforeAll(async () => {
    configDir = await mkdtemp(path.join(tmpdir(), 'protobase-scaffold-'))
    await run()
  })

  afterAll(() => rm(configDir, { recursive: true, force: true }))

  it('declares the composite key of sales.order_lines', async () => {
    expect(await read('orderLines', 'data.ts')).toContain('.primaryKey((r) => [r.orderId, r.lineNo])')
  })

  it('maps sales.invoices.status to the Postgres enum values', async () => {
    expect(await read('invoices', 'data.ts')).toContain("status: f.enum(['draft', 'sent', 'paid', 'overdue'])")
  })

  it('maps legacy uppercase columns with .column()', async () => {
    expect(await read('empMaster', 'data.ts')).toContain("empName: f.text().column('EMP_NAME')")
  })

  it('registers every resource in config/index.ts', async () => {
    const index = await read('index.ts')
    expect(index).toContain("export { orders } from './orders/data'")
    expect(index).toContain("export { ordersView } from './orders/ui'")
  })

  it('is a no-op when re-run', async () => {
    const plan = await run()
    expect(plan.changes).toEqual([])
  })

  it('keeps ignored columns ignored and hand edits intact, adding only missing columns', async () => {
    const file = path.join(configDir, 'orders', 'data.ts')
    const original = await readFile(file, 'utf8')
    const edited = original
      .replace('notes: f.text().optional(),', 'notes: null,')
      .replace('number: f.text().filterable().sortable(),', 'number: f.text().regex(/^SO-/, "SO- prefix"),')
      .replace(/ {4}paid: .*\n/, '')
    await writeFile(file, edited)

    const plan = await run()
    expect(plan.changes.map((c) => path.basename(path.dirname(c.path)))).toEqual(['orders'])

    const after = await readFile(file, 'utf8')
    expect(after).toContain('notes: null,')
    expect(after).toContain('number: f.text().regex(/^SO-/, "SO- prefix"),')
    expect(after).toContain('paid: f.boolean().default(false)')
    expect(after.match(/notes/g)).toHaveLength(1)
    expect((await run()).changes).toEqual([])
  })

  it('reports drift for a declared type that no longer fits', async () => {
    const file = path.join(configDir, 'orders', 'data.ts')
    await writeFile(file, (await readFile(file, 'utf8')).replace('paid: f.boolean()', 'paid: f.integer()'))
    const plan = await run()
    expect(plan.drift).toEqual([
      expect.objectContaining({ resource: 'orders', field: 'paid', problem: 'declared integer, database is boolean' }),
    ])
  })
})
