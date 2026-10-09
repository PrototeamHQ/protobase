import type { TransactionSql } from 'postgres'
import { afterAll, describe, expect, it } from 'vitest'
import { connect, type Db } from '../../../examples/real-estate/db/connection'
import { databaseSeeded } from './seeded'

const seeded = await databaseSeeded()
const sql = connect({ max: 2 })
afterAll(() => sql.end())

type Tx = TransactionSql<{}>

class Rollback extends Error {}

// Runs `work` in a transaction that is always rolled back, so the seeded data stays as it was. A refused statement
// aborts the transaction, so it comes last.
const inRollback = async (work: (tx: Tx) => Promise<void>) => {
  try {
    await sql.begin(async (tx) => {
      await work(tx)
      throw new Rollback()
    })
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }
}

// A lease that is still running, open-ended, on a unit with no later lease.
const runningLease = async () => {
  const [lease] = await sql<Array<{ id: string; unit_id: string; organization_id: number; start_date: string }>>`
    select id, unit_id, organization_id, start_date::text as start_date from leasing.leases l
    where end_date is null and not exists (select 1 from leasing.leases n where n.unit_id = l.unit_id and n.start_date > l.start_date)
    order by id limit 1
  `
  return lease!
}

const insertLease = (tx: Tx | Db, lease: { unit_id: string; organization_id: number }, number: string, start: string, end: string | null) => tx`
  insert into leasing.leases (organization_id, number, unit_id, term, start_date, end_date, monthly_rent)
  values (${lease.organization_id}, ${number}, ${lease.unit_id}, ${end === null ? 'indefinite' : 'fixed'}, ${start}, ${end}, 1500)
`

describe.skipIf(!seeded)('rules Postgres enforces itself', () => {
  it('refuses a lease that overlaps another on the same unit', async () => {
    const lease = await runningLease()
    await expect(insertLease(sql, lease, 'HC-TEST-OVERLAP', '2027-01-01', '2027-12-31')).rejects.toMatchObject({ code: '23P01', constraint_name: 'leases_no_overlap' })
    expect(await sql`select 1 from leasing.leases where number = 'HC-TEST-OVERLAP'`).toHaveLength(0)
  })

  it('accepts the next lease once the running one has an end date', async () => {
    const lease = await runningLease()
    await inRollback(async (tx) => {
      await tx`update leasing.leases set end_date = '2026-12-31', notice_given_on = '2026-10-01' where id = ${lease.id}`
      await insertLease(tx, lease, 'HC-TEST-NEXT', '2027-01-01', null)
      await expect(insertLease(tx, lease, 'HC-TEST-SAME-DAY', '2026-12-31', '2027-06-30')).rejects.toMatchObject({ code: '23P01' })
    })
  })

  // Organization 2: the access test pays a charge of organization 1 through the API.
  it('refuses payments that add up to more than their charge, and keeps paid_amount and arrears in step', async () => {
    const [charge] = await sql`select id, organization_id, lease_id, amount::text as amount from billing.rent_charges where organization_id = 2 and paid_amount = 0 order by id limit 1`
    await inRollback(async (tx) => {
      const before = await tx`select balance::text as balance from billing.arrears where lease_id = ${charge!.lease_id}`
      await tx`insert into billing.payments (organization_id, charge_id, paid_on, amount, method) values (${charge!.organization_id}, ${charge!.id}, '2026-10-06', 10, 'ideal')`
      const [paid] = await tx`select paid_amount::text as paid from billing.rent_charges where id = ${charge!.id}`
      expect(paid!.paid).toBe('10.00')
      const after = await tx`select balance::text as balance from billing.arrears where lease_id = ${charge!.lease_id}`
      expect(Number(after[0]?.balance ?? 0)).toBeCloseTo(Number(before[0]!.balance) - 10, 2)
      await expect(tx`insert into billing.payments (organization_id, charge_id, paid_on, amount, method) values (${charge!.organization_id}, ${charge!.id}, '2026-10-06', ${charge!.amount}, 'ideal')`).rejects.toMatchObject({ code: '23514' })
    })
  })

  it('moves a ticket forward only, and stamps closed_at when it closes', async () => {
    const [ticket] = await sql`select id from maintenance.tickets where status = 'reported' order by id limit 1`
    await inRollback(async (tx) => {
      await tx`update maintenance.tickets set status = 'scheduled' where id = ${ticket!.id}`
      const [done] = await tx`update maintenance.tickets set status = 'done' where id = ${ticket!.id} returning closed_at`
      expect(done!.closed_at).toBeInstanceOf(Date)
      await expect(tx`update maintenance.tickets set status = 'reported' where id = ${ticket!.id}`).rejects.toMatchObject({ code: '23514' })
    })
    const [skipping] = await sql`select id from maintenance.tickets where status = 'reported' order by id limit 1`
    await expect(sql`update maintenance.tickets set status = 'done' where id = ${skipping!.id}`).rejects.toMatchObject({ code: '23514' })
  })
})
