import { view } from '@protobase/schema'
import type { companyTags } from './data'

export const companyTagsView = view<typeof companyTags>('company_tags')
  .nav({ hidden: true })
  .names({ singular: 'Company tag', plural: 'Company tags' })
  .list((r) => ({ columns: [r.added_at, r.added_by] }))
