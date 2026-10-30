import { view } from '@protobase/schema'
import type { organizations } from './data'

export const organizationsView = view<typeof organizations>('organizations')
  .names({ singular: 'Organization', plural: 'Organizations' })
  .icon('settings')
  .fields((r) => ({ kvk_number: r.kvk_number.label('KvK number').help('Chamber of Commerce registration.').format('code') }))
  .list((r) => ({ columns: [r.name, r.slug, r.city, r.kvk_number] }))
