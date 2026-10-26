import { FatalJobError, type JobRun } from '@protobase/server'
import { repairReady } from '../repair-ready'

// Enqueued by the write hook of a repair that became ready (hooks/email-ready-repair.ts), so the email goes out only
// once the write has committed, and a refused message is retried.
export default (async ({ repairId }, { db, mail }) => {
  if (!mail) throw new FatalJobError('Mail is off: set PROTOBASE_SMTP_URL and PROTOBASE_MAIL_FROM')
  const repair = await db
    .selectFrom('repairs')
    .innerJoin('customers', 'customers.id', 'repairs.customer_id')
    .select(['repairs.number', 'repairs.bike', 'customers.name', 'customers.email'])
    .where('repairs.id', '=', repairId)
    .executeTakeFirst()
  if (!repair?.email) return
  const url = `https://bikeshop.example.com/repairs/${repair.number}`
  await repairReady.send(repair.email, { customer: repair.name, bike: repair.bike, number: repair.number, url }, mail)
}) satisfies JobRun<{ repairId: number }>
