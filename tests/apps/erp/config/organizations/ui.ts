import { view } from '@protobase/schema'
import type { organizations } from './data'

export const organizationsView = view<typeof organizations>('organizations')
  .names({ singular: 'Organization', plural: 'Organizations' })
  .icon('settings')
  .list((r) => ({ columns: [r.name, r.slug, r.country_code, r.currency_code] }))
