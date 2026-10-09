import { view } from '@protobase/schema'
import type { countries } from './data'

export const countriesView = view<typeof countries>('countries')
  .names({ singular: 'Country', plural: 'Countries' })
  .list((r) => ({ columns: [r.name, r.euMember] }))
