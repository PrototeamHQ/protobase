import { view } from '@protobase/schema'
import type { vendors } from './data'

export const vendorsView = view<typeof vendors>('vendors')
  .title((r) => r.name)
  .names({ singular: 'Vendor', plural: 'Vendors' })
  .fields((r) => ({ trade: r.trade.format('badge').valueLabels({
      plumbing: 'Plumbing',
      heating: 'Heating',
      electrical: 'Electrical',
      roofing: 'Roofing',
      carpentry: 'Carpentry',
      locksmith: 'Locksmith',
      pest_control: 'Pest control',
      general: 'General',
    }), hourlyRate: r.hourlyRate.prefix('€').decimals(2) }))
  .list((r) => ({ columns: [r.name, r.trade, r.phone, r.hourlyRate, r.active] }))
  .filters((r, w) => [w.facets(r.trade)])
