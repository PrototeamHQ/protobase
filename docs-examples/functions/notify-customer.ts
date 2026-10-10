import { z } from 'zod'
import { defineFunction, readJson, requireEnv } from '@protobase/server'

const Input = z.object({ repairId: z.number().int().positive() })

// POST /api/functions/notify-customer { "repairId": 7 }: texts the customer that their bike is ready, through an SMS
// provider's API. The key comes from the environment: .env in development, the host's settings in production.
export default defineFunction({ roles: ['desk'] }, async (request, { records }) => {
  const { repairId } = await readJson(request, Input)
  const { record: repair } = await records.get('repairs', repairId)
  const { record: customer } = await records.get('customers', repair.customerId as number)
  if (!customer.phone) return Response.json({ sent: false, reason: 'The customer has no phone number' })

  const sent = await fetch('https://api.sms.example/v1/messages', {
    method: 'POST',
    headers: { authorization: `Bearer ${requireEnv('SMS_API_KEY')}`, 'content-type': 'application/json' },
    body: JSON.stringify({ to: customer.phone, text: `Hi ${customer.name}, your ${repair.bike} is ready for pickup.` }),
  })
  if (!sent.ok) throw new Error(`The SMS provider answered ${sent.status}`)
  return Response.json({ sent: true })
})
