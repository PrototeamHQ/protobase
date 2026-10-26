import { view } from '@protobase/schema'
import type { users } from './data'

export const usersView = view<typeof users>('users')
  .names({ singular: 'User', plural: 'Users' })
  // Reached from the records that name a user; the profile menu's Users is the accounts page.
  .nav({ hidden: true })
  .fields((r) => ({ role: r.role.valueLabels({ admin: 'Admin', sales: 'Sales', finance: 'Finance', warehouse: 'Warehouse' }) }))
  .list((r) => ({ columns: [r.email, r.name, r.role, r.active] }))
