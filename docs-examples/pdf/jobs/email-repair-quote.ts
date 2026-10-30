import { FatalJobError, type JobRun } from '@protobase/server'
import { repairQuote } from '../documents/repair-quote'

// Emails the customer their repair's quote, the PDF attached as it was rendered.
export default (async ({ repairId }, { db, mail }) => {
  if (!mail) throw new FatalJobError('Mail is off: set PROTOBASE_SMTP_URL and PROTOBASE_MAIL_FROM')
  const repair = await db
    .selectFrom('repairs')
    .innerJoin('customers', 'customers.id', 'repairs.customer_id')
    .select(['repairs.number', 'repairs.bike', 'repairs.problem', 'repairs.estimate', 'repairs.currency', 'customers.name', 'customers.email'])
    .where('repairs.id', '=', repairId)
    .executeTakeFirst()
  if (!repair?.email) return
  const pdf = await repairQuote.render({
    number: repair.number,
    customer: repair.name,
    bike: repair.bike,
    problem: repair.problem,
    estimate: `${repair.currency} ${repair.estimate}`,
  })
  await mail.send({
    to: repair.email,
    subject: `Quote ${repair.number} for your ${repair.bike}`,
    text: `Hi ${repair.name}, the quote for your ${repair.bike} is attached.`,
    attachments: [{ filename: `quote-${repair.number}.pdf`, content: pdf, contentType: 'application/pdf' }],
  })
}) satisfies JobRun<{ repairId: number }>
