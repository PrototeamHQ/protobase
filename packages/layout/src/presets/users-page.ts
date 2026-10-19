import { Page, Users } from '../blocks'
import { page } from '../page'

/**
 * The Users page, for admins at `/accounts`: everyone who can sign in. Export it from the config, and put it in the
 * profile menu with `m.page('accounts', { label: 'Users', icon: 'users' })`; or make a page of your own around `<Users />`.
 * Written as calls rather than JSX, which the CLI's Node loader would compile for React inside this package.
 */
export const usersPage = page(
  'accounts',
  Page({ title: 'Users', description: 'Everyone who can sign in: invite, add, change roles and block.', children: Users({}) }),
  { roles: ['admin'], icon: 'users' },
)
