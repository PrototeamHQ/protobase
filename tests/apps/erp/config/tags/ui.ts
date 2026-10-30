import { view } from '@protobase/schema'
import type { tags } from './data'

export const tagsView = view<typeof tags>('tags')
  .names({ singular: 'Tag', plural: 'Tags' })
  .icon('tags')
  .list((r) => ({ columns: [r.name, r.color] }))
