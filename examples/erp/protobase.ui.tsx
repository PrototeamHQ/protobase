import { defineUi, type ActionContext } from '@protobase/ui'

// The custom components, each in a file of its own, exported by the name their layouts declare.
export { OrdersPerDay } from './components/orders-per-day'

/** "Send reminder" on an invoice: opens a mail to the customer, and marks a draft invoice as sent. */
const send = async ({ record, recordKey, etag, client }: ActionContext) => {
  const company = await client.get('companies', String(record!.company_id))
  const subject = encodeURIComponent(`Invoice ${String(record!.number)}`)
  window.location.assign(`mailto:${String(company.record.email ?? '')}?subject=${subject}`)
  if (record!.status === 'draft') await client.update('invoices', recordKey!, { status: 'sent' }, etag ?? '*')
}

export default defineUi({ actions: { send } })
