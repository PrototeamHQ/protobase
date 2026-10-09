import { afterAll, describe, expect, it } from 'vitest'
import { connect } from '../../../examples/real-estate/db/connection'
import type { ScaleName } from '../../../examples/real-estate/seed/scales'
import { buildWorld } from '../../../examples/real-estate/seed/world'
import { databaseSeeded } from './seeded'

const seeded = await databaseSeeded()
const sql = connect({ max: 2 })
afterAll(() => sql.end())

// First column of the first row, as a number.
const scalar = async (query: PromiseLike<readonly object[]>) => Number(Object.values((await query)[0]!)[0])

const count = (table: string) => scalar(sql.unsafe(`select count(*) from ${table}`))

describe.skipIf(!seeded)('seeded real estate database', async () => {
  const [{ scale }] = seeded ? await sql`select scale from public.seed_info order by seeded_at desc limit 1` : [{ scale: 'small' }]
  const world = buildWorld(scale as ScaleName)
  const total = (pick: (org: (typeof world.orgs)[number]) => number) => world.orgs.reduce((sum, org) => sum + pick(org), 0)

  it('has the row counts the seed allocated', async () => {
    expect(await count('core.organizations')).toBe(2)
    expect(await count('portfolio.properties')).toBe(total((org) => org.propertyCount))
    expect(await count('portfolio.units')).toBe(total((org) => org.unitCount))
    expect(await count('leasing.leases')).toBe(total((org) => org.leaseCount))
    expect(await count('leasing.deposits')).toBe(total((org) => org.leaseCount))
    expect(await count('leasing.tenants')).toBe(total((org) => org.tenantStarts[org.leaseCount]!))
    expect(await count('maintenance.tickets')).toBe(total((org) => org.ticketCount))
    expect(await count('billing.rent_charges')).toBeGreaterThan(total((org) => org.unitCount) * 30)
    expect(await count('billing.payments')).toBeGreaterThan(0)
    expect(await count('billing.arrears')).toBeGreaterThan(0)
  })

  it('keeps an organization_id on every table except the reference tables', async () => {
    const without = await sql`
      select table_schema || '.' || table_name as name from information_schema.tables t
      where table_schema in ('core', 'portfolio', 'leasing', 'billing', 'maintenance')
        and not exists (select 1 from information_schema.columns c where c.table_schema = t.table_schema and c.table_name = t.table_name and c.column_name = 'organization_id')
      order by 1
    `
    expect(without.map((row) => row.name)).toEqual(['core.organizations', 'portfolio.amenities'])
  })

  it('seeds both organizations in every business table, and keeps children in their parent\'s organization', async () => {
    for (const table of ['portfolio.properties', 'portfolio.units', 'leasing.leases', 'billing.rent_charges', 'billing.payments', 'maintenance.tickets', 'maintenance.inspections']) {
      const both = await sql.unsafe(`select exists (select 1 from ${table} where organization_id = 1) and exists (select 1 from ${table} where organization_id = 2) as both`)
      expect(both[0]!.both, table).toBe(true)
    }
    const crossed = await scalar(sql`
      select (select count(*) from portfolio.units u join portfolio.properties p on p.id = u.property_id where u.organization_id <> p.organization_id)
           + (select count(*) from leasing.leases l join portfolio.units u on u.id = l.unit_id where l.organization_id <> u.organization_id)
           + (select count(*) from billing.rent_charges c join leasing.leases l on l.id = c.lease_id where c.organization_id <> l.organization_id)
           + (select count(*) from billing.payments p join billing.rent_charges c on c.id = p.charge_id where p.organization_id <> c.organization_id)
           + (select count(*) from maintenance.tickets t join portfolio.properties p on p.id = t.property_id where t.organization_id <> p.organization_id)
    `)
    expect(crossed).toBe(0)
  }, 60_000)

  it('has no overlapping leases on a unit', async () => {
    const overlaps = await scalar(sql`
      select count(*) from leasing.leases a join leasing.leases b
        on a.unit_id = b.unit_id and a.id < b.id and daterange(a.start_date, a.end_date, '[]') && daterange(b.start_date, b.end_date, '[]')
    `)
    expect(overlaps).toBe(0)
  })

  it('never pays more than a charge, and keeps paid_amount equal to the payments', async () => {
    const bad = await scalar(sql`
      select count(*) from billing.rent_charges c
      left join (select charge_id, sum(amount) as paid from billing.payments group by charge_id) p on p.charge_id = c.id
      where coalesce(p.paid, 0) > c.amount or coalesce(p.paid, 0) <> c.paid_amount
    `)
    expect(bad).toBe(0)
  }, 60_000)

  it('keeps outstanding equal to the amount minus paid_amount on every charge', async () => {
    const bad = await scalar(sql`select count(*) from billing.rent_charges where outstanding <> amount - paid_amount`)
    expect(bad).toBe(0)
  })

  it('has arrears equal to the charges minus the payments, per lease', async () => {
    const mismatched = await scalar(sql`
      with owed as (
        select c.lease_id, sum(c.amount) - coalesce(sum(p.paid), 0) as balance
        from billing.rent_charges c
        left join (select charge_id, sum(amount) as paid from billing.payments group by charge_id) p on p.charge_id = c.id
        group by c.lease_id
      )
      select count(*) from (select * from owed where balance > 0) o full join billing.arrears a using (lease_id)
      where o.balance is distinct from a.balance
    `)
    expect(mismatched).toBe(0)
    const late = await scalar(sql`select count(*) from billing.arrears where open_charges >= 3`)
    expect(late).toBeGreaterThan(0)
  }, 60_000)

  it('bills one charge per month of a lease, on the first', async () => {
    const outside = await scalar(sql`
      select count(*) from billing.rent_charges c join leasing.leases l on l.id = c.lease_id
      where c.period < date_trunc('month', l.start_date) or (l.end_date is not null and c.period > l.end_date) or c.due_on <> c.period
    `)
    expect(outside).toBe(0)
  })

  it('marks a unit let exactly when a lease covers the day the seed ends', async () => {
    const wrong = await scalar(sql`
      select count(*) from portfolio.units u
      where (u.status = 'let') <> exists (
        select 1 from leasing.leases l where l.unit_id = u.id and daterange(l.start_date, l.end_date, '[]') @> date '2026-10-06'
      )
    `)
    expect(wrong).toBe(0)
  })

  it('gives every lease one primary tenant and one deposit', async () => {
    expect(await scalar(sql`select count(*) from leasing.leases l where (select count(*) from leasing.lease_tenants t where t.lease_id = l.id and t.role = 'primary') <> 1`)).toBe(0)
    expect(await scalar(sql`select count(*) from leasing.leases l left join leasing.deposits d on d.lease_id = l.id where d.id is null`)).toBe(0)
  })

  it('has work orders only for scheduled and done tickets, and closes only done and cancelled ones', async () => {
    expect(await scalar(sql`select count(*) from maintenance.work_orders w join maintenance.tickets t on t.id = w.ticket_id where t.status not in ('scheduled', 'done')`)).toBe(0)
    expect(await scalar(sql`select count(*) from maintenance.tickets t where t.status = 'done' and exists (select 1 from maintenance.work_orders w where w.ticket_id = t.id and w.completed_on is null)`)).toBe(0)
    expect(await scalar(sql`select count(distinct status) from maintenance.tickets`)).toBe(4)
  })

  it('has analyzed rent_charges.period', async () => {
    const stats = await sql`select 1 from pg_stats where schemaname = 'billing' and tablename = 'rent_charges' and attname = 'period'`
    expect(stats).toHaveLength(1)
  })
})
