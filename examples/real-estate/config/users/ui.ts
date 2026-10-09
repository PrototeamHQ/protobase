import { view } from '@protobase/schema'
import type { users } from './data'

export const usersView = view<typeof users>('users')
  .title((r) => r.name)
  .names({ singular: 'User', plural: 'Users' })
  .fields((r) => ({ role: r.role.format('badge').valueLabels({ admin: 'Admin', manager: 'Manager', finance: 'Finance', maintenance: 'Maintenance' }) }))
  .list((r) => ({ columns: [r.name, r.email, r.role, r.active] }))
  .filters((r, w) => [w.facets(r.role)])
