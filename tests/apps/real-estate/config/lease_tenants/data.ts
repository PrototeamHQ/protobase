import { f, resource } from '@protobase/schema'
import { access } from '../roles'

/** leasing.lease_tenants: who signed a lease, one primary tenant and any co-signers. */
export const leaseTenants = resource('lease_tenants')
  .table('leasing.lease_tenants')
  .fields({
    lease_id: f.relation('leases').filterable().sortable(),
    tenant_id: f.relation('tenants').filterable().sortable(),
    organization_id: f.relation('organizations').filterable().sortable(),
    role: f.enum(['primary', 'co_signer']).filterable().sortable(),
    added_at: f.timestamp().dbDefault(),
  })
  .primaryKey((r) => [r.lease_id, r.tenant_id])
  .tenant((r) => r.organization_id)
  .access(access('lease_tenants'))
