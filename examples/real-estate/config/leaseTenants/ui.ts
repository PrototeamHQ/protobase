import { view } from '@protobase/schema'
import type { leaseTenants } from './data'

export const leaseTenantsView = view<typeof leaseTenants>('leaseTenants')
  .nav({ hidden: true })
  .names({ singular: 'Lease tenant', plural: 'Lease tenants' })
  .fields((r) => ({ role: r.role.format('badge').valueLabels({ primary: 'Primary', co_signer: 'Co-signer' }) }))
  .list((r) => ({ columns: [r.leaseId, r.tenantId, r.role] }))
