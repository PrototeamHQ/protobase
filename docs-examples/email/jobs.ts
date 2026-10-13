import { defineJob, FatalJobError } from '@protobase/server'
import { z } from 'zod'
import { repairReady } from './repair-ready'

// Enqueued by the write hook of a repair that became ready (see protobase.config.ts), so the email goes out only once
// the write has committed, and a refused message is retried.
export const emailRepairReady = defineJob({
  name: 'email-repair-ready',
  payload: z.object({ repairId: z.number() }),
  run: async ({ repairId }, { db, mail }) => {
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
  },
})
