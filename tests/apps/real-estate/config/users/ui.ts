import { view } from '@protobase/schema'
import type { users } from './data'

export const usersView = view<typeof users>('users')
  .title((r) => r.name)
  .names({ singular: 'User', plural: 'Users' })
  .icon('users')
  // Reached from the records that name a user; the profile menu's Users is the accounts page.
  .nav({ hidden: true })
  .fields((r) => ({ role: r.role.format('badge').valueLabels({ admin: 'Admin', manager: 'Manager', finance: 'Finance', maintenance: 'Maintenance' }) }))
  .list((r) => ({ columns: [r.name, r.email, r.role, r.active] }))
  .filters((r, w) => [w.facets(r.role)])
