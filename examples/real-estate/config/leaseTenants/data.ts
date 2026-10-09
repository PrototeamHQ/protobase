import { f, resource } from '@protobase/schema'
import { access } from '../roles'

/** leasing.lease_tenants: who signed a lease, one primary tenant and any co-signers. */
export const leaseTenants = resource('leaseTenants')
  .table('leasing.lease_tenants')
  .fields({
    leaseId: f.relation('leases').filterable().sortable(),
    tenantId: f.relation('tenants').filterable().sortable(),
    organizationId: f.relation('organizations').filterable().sortable(),
    role: f.enum(['primary', 'co_signer']).filterable().sortable(),
    addedAt: f.timestamp().dbDefault(),
  })
  .primaryKey((r) => [r.leaseId, r.tenantId])
  .tenant((r) => r.organizationId)
  .access(access('leaseTenants'))
