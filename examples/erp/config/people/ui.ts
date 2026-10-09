import { view } from '@protobase/schema'
import type { people } from './data'

export const peopleView = view<typeof people>('people')
  .names({ singular: 'People', plural: 'People' })
  .list((r) => ({ columns: [r.firstName, r.lastName, r.email, r.phone, r.jobTitle] }))
