import { view } from '@protobase/schema'
import type { people } from './data'

export const peopleView = view<typeof people>('people')
  .names({ singular: 'People', plural: 'People' })
  .list((r) => ({ columns: [r.first_name, r.last_name, r.email, r.phone, r.job_title] }))
