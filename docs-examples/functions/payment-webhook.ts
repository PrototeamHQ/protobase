import { defineFunction, requireEnv, verifySignature } from '@protobase/server'

type PaymentEvent = { type: string; data: { reference: string } }

// POST /api/functions/payment-webhook: the payment provider says a repair is paid. Nobody signs in to send it, so the
// function is public and checks the provider's signature instead; with no caller, it writes through the database
// directly, past every access rule.
export default defineFunction({ public: true }, async (request, { db }) => {
  const body = await verifySignature(request, { secret: requireEnv('PAYMENTS_WEBHOOK_SECRET'), header: 'x-signature', prefix: 'sha256=' })
  const event = JSON.parse(body) as PaymentEvent
  if (event.type === 'payment.succeeded') {
    await db.updateTable('shop.repairs').set({ paid: true }).where('number', '=', event.data.reference).execute()
  }
  return new Response(null, { status: 204 })
})
