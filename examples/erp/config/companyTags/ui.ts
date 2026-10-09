import { view } from '@protobase/schema'
import type { companyTags } from './data'

export const companyTagsView = view<typeof companyTags>('companyTags')
  .nav({ hidden: true })
  .names({ singular: 'Company tag', plural: 'Company tags' })
  .list((r) => ({ columns: [r.addedAt, r.addedBy] }))
