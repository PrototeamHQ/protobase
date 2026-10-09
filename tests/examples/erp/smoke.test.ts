import { afterAll, describe, expect, it } from 'vitest'
import { connect } from '../../../examples/erp/db/connection'
import { scales, type ScaleName } from '../../../examples/erp/seed/scales'
import { databaseReachable } from './reachable'

const reachable = await databaseReachable()
const sql = connect({ max: 2 })
afterAll(() => sql.end())

// First column of the first row, as a number.
const scalar = async (query: PromiseLike<readonly object[]>) => Number(Object.values((await query)[0]!)[0])

const count = (table: string) => scalar(sql.unsafe(`select count(*) from ${table}`))

describe.skipIf(!reachable)('seeded erp database', async () => {
  const [{ scale }] = reachable ? await sql`select scale from public.seed_info order by seeded_at desc limit 1` : [{ scale: 'small' }]
  const expected = scales[scale as ScaleName]

  it('has the row counts of the seeded scale', async () => {
    expect(await count('core.organizations')).toBe(2)
    expect(await count('crm.companies')).toBe(expected.companies)
    expect(await count('catalog.products')).toBe(expected.productsPerOrg * 2)
    expect(await count('sales.orders')).toBe(expected.orders)
    expect(await count('inventory.stock_moves')).toBe(expected.moves)
    expect(await count('sales.invoices')).toBeGreaterThan(0)
    expect(await count('hr."EMP_MASTER"')).toBeGreaterThan(0)
  })

  it('seeds both organizations in every business table', async () => {
    const tables = ['crm.companies', 'catalog.products', 'sales.orders', 'sales.invoices', 'inventory.stock_moves']
    for (const table of tables) {
      expect(await scalar(sql.unsafe(`select count(distinct organization_id) from ${table}`)), table).toBe(2)
    }
  })

  it('has invoice totals equal to the sum of their lines', async () => {
    const bad = await scalar(sql`
      select count(*) as bad from sales.invoices i
      left join (select invoice_id, sum(line_total) as subtotal from sales.invoice_lines group by invoice_id) l on l.invoice_id = i.id
      where i.subtotal is distinct from l.subtotal or i.total <> i.subtotal + i.vat
    `)
    expect(bad).toBe(0)
  })

  it('has stock levels equal to the sum of their moves', async () => {
    const bad = await scalar(sql`
      select count(*) as bad from (
        select product_id, location_id, sum(quantity) as total from inventory.stock_moves group by product_id, location_id
      ) moves
      full join inventory.stock_levels levels using (product_id, location_id)
      where moves.total is distinct from levels.quantity
    `)
    expect(bad).toBe(0)
  })

  it('keeps composite keys unique', async () => {
    const duplicates = await scalar(sql`
      select count(*) as duplicates from (select 1 from sales.order_lines group by order_id, line_no having count(*) > 1) d
    `)
    expect(duplicates).toBe(0)

    const duplicate = sql.begin((tx) => tx`
      insert into sales.order_lines (order_id, line_no, organization_id, product_id, description, quantity, unit_price)
      select order_id, line_no, organization_id, product_id, description, quantity, unit_price from sales.order_lines limit 1
    `)
    await expect(duplicate).rejects.toMatchObject({ code: '23505' })
  })

  it('has no orphaned foreign keys', async () => {
    const bad = await scalar(sql`
      select (select count(*) from sales.order_lines l left join catalog.products p on p.id = l.product_id where p.id is null)
           + (select count(*) from sales.orders o left join crm.companies c on c.id = o.company_id where c.id is null)
           + (select count(*) from inventory.stock_moves m left join inventory.locations l on l.id = m.location_id where l.id is null) as bad
    `)
    expect(bad).toBe(0)
  })

  it('has analyzed stock_moves.moved_at', async () => {
    const stats = await sql`select 1 from pg_stats where schemaname = 'inventory' and tablename = 'stock_moves' and attname = 'moved_at'`
    expect(stats).toHaveLength(1)
  })
})
