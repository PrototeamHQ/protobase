import { view } from '@protobase/schema'
import type { organizations } from './data'

export const organizationsView = view<typeof organizations>('organizations')
  .names({ singular: 'Organization', plural: 'Organizations' })
  .list((r) => ({ columns: [r.name, r.slug, r.countryCode, r.currencyCode] }))
