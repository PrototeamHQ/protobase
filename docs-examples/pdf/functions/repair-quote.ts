import { defineFunction } from '@protobase/server'
import { repairQuote } from '../documents/repair-quote'

// GET /api/functions/repair-quote/7: the repair's quote as a PDF file, which the browser shows or saves.
export default defineFunction({ roles: ['desk'] }, async (request, { records }) => {
  const id = Number(new URL(request.url).pathname.slice(1))
  const { record: repair } = await records.get('repairs', id)
  const { record: customer } = await records.get('customers', repair.customer_id as number)
  const number = repair.number as string
  const pdf = await repairQuote.render({
    number,
    customer: customer.name as string,
    bike: repair.bike as string,
    problem: repair.problem as string,
    estimate: `${repair.currency} ${repair.estimate}`,
  })
  return new Response(pdf, { headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="quote-${number}.pdf"` } })
})
