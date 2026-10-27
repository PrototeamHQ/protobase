import { describe, expect, it } from 'vitest'
import type { DatabaseTable } from './ask-tables'
import { createFromDatabase, type DatabaseSteps, type ImportChoices } from './database-wizard'

const url = 'postgres://shop:s3cret@db.example.com:5432/shop'
const tables: DatabaseTable[] = [
  { schema: 'public', name: 'customers', columns: 4, references: [] },
  { schema: 'public', name: 'orders', columns: 6, references: ['public.customers'] },
  { schema: 'public', name: 'order_lines', columns: 5, references: ['public.orders'] },
]

// The steps as fakes that record what the wizard did, in order, and a terminal that answers in turn.
const run = async (answers: string[] | undefined, options: { dir?: string; tables?: DatabaseTable[]; bun?: boolean } = {}) => {
  const done: string[] = []
  const imports: ImportChoices[] = []
  const asked: string[] = []
  let printed = ''
  const steps: DatabaseSteps = {
    checkConnection: async (to) => (done.push(`check ${to}`), { database: 'shop', version: '18.1' }),
    writeProject: async (dir, to) => void done.push(`write ${dir} on ${to}`),
    install: async (dir, manager) => void done.push(`install ${dir} with ${manager}`),
    listTables: async (dir) => (done.push(`list from ${dir}`), { tables: options.tables ?? tables, skipped: ['public.order_totals: a view'] }),
    importTables: async (dir, _, choices) => void (done.push(`import into ${dir}`), imports.push(choices)),
    tools: { bun: options.bun ?? true, docker: false },
  }
  const ask = answers && (async (text: string) => (asked.push(text), answers.shift() ?? ''))
  await createFromDatabase(url, options.dir, { ...(ask && { ask }), print: (text) => void (printed += text) }, steps)
  return { done, imports, asked, printed }
}

describe('createFromDatabase', () => {
  it('checks the connection, asks the folder, writes and installs the project, then asks how to import the tables', async () => {
    const { done, imports, asked } = await run(['', '1,2', 'n', 'y'])
    expect(done).toEqual([`check ${url}`, `write shop on ${url}`, 'install shop with bun', 'list from shop', 'import into shop'])
    expect(asked).toEqual([
      'Project folder [shop]: ',
      'Which tables become resources? Numbers, ranges or names, such as 1,3-5 [all]: ',
      'Write a ui.ts for each too, with its names and list? [Y/n]: ',
      'Review the field proposed for each column? [y/N]: ',
    ])
    expect(imports).toEqual([{ tables: ['public.customers', 'public.orders'], excluded: ['public.order_lines'], ui: false, review: true }])
  })

  it('never prints the password, and lists the tables with what it leaves out', async () => {
    const { printed } = await run(['my-shop', '', '', ''])
    expect(printed).not.toContain('s3cret')
    expect(printed).toContain('Connecting to db.example.com:5432/shop, read-only...\n')
    expect(printed).toContain('  2. public.orders       6 columns\n')
    expect(printed).toContain('Left out:\n  public.order_totals: a view\n')
  })

  it('takes every table with a ui.ts and no review by default, and ends with the next steps', async () => {
    const { imports, printed } = await run(['my-shop', '', '', ''])
    expect(imports).toEqual([{ tables: tables.map((t) => `${t.schema}.${t.name}`), excluded: [], ui: true, review: false }])
    expect(printed).toContain('Created a Protobase project in my-shop on the database shop, which it has only read. Next:\n\n  cd my-shop\n  bun run db:migrate ')
  })

  it('imports the tables the picked ones point to as well, and says so', async () => {
    const { imports, printed } = await run(['', 'order_lines', '', ''])
    expect(imports[0]!.tables).toEqual(['public.customers', 'public.orders', 'public.order_lines'])
    expect(printed).toContain('  and public.customers, public.orders, which they point to\n')
  })

  it('asks nothing without a terminal: the folder is the database, every table is imported with a ui.ts', async () => {
    const { done, imports } = await run(undefined)
    expect(done).toContain(`write shop on ${url}`)
    expect(imports).toEqual([{ tables: tables.map((t) => `${t.schema}.${t.name}`), excluded: [], ui: true, review: false }])
  })

  it('takes the folder it is given without asking', async () => {
    const { asked, done } = await run(['', '', ''], { dir: 'admin' })
    expect(asked[0]).toMatch(/^Which tables/)
    expect(done).toContain(`write admin on ${url}`)
  })

  it('installs with npm without Bun', async () => {
    expect((await run(undefined, { bun: false })).done).toContain('install shop with npm')
  })

  it('imports nothing from a database without tables to import', async () => {
    const { done, printed } = await run(['', ''], { tables: [] })
    expect(done.some((step) => step.startsWith('import'))).toBe(false)
    expect(printed).toContain('shop has no tables to import: it leaves out public.order_totals: a view. The project starts without resources.\n')
  })
})
