import { defineUi, type ActionContext } from '@protobase/ui'

/** "Send reminder" on an arrears row: opens a mail to the lease's primary tenant about what is outstanding. */
const remind = async ({ record, client }: ActionContext) => {
  const leaseId = String(record!.lease_id)
  const signers = await client.list('lease_tenants', { filter: `lease_id = ${leaseId} AND role = "primary"`, pageSize: 1 })
  const tenantId = signers.items[0]?.tenant_id
  const tenant = tenantId === undefined ? undefined : await client.get('tenants', String(tenantId))
  const lease = await client.get('leases', leaseId)
  const subject = encodeURIComponent(`Rent outstanding on lease ${String(lease.record.number)}`)
  const body = encodeURIComponent(`€${String(record!.balance)} is outstanding, the oldest since ${String(record!.oldest_due_on)}.`)
  window.location.assign(`mailto:${String(tenant?.record.email ?? '')}?subject=${subject}&body=${body}`)
}

export default defineUi({ actions: { remind } })
