import { z } from 'zod'
import { defineFunction, readJson } from '@protobase/server'
import { repairReady } from './repair-ready'

const Input = z.object({ repairId: z.number().int().positive() })

// POST /api/functions/resend-repair-ready { "repairId": 7 }: the desk sends the email again, as the answer to the request.
export default defineFunction({ roles: ['desk'] }, async (request, { records }) => {
  const { repairId } = await readJson(request, Input)
  const { record: repair } = await records.get('repairs', repairId)
  const { record: customer } = await records.get('customers', repair.customer_id as number)
  if (!customer.email) return Response.json({ sent: false, reason: 'The customer has no email address' })
  const number = repair.number as string
  await repairReady.send(customer.email as string, { customer: customer.name as string, bike: repair.bike as string, number, url: `https://bikeshop.example.com/repairs/${number}` })
  return Response.json({ sent: true })
})
