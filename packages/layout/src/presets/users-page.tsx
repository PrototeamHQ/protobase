/** @jsxImportSource @protobase/layout */
import { Page, Users } from '../blocks'
import { page } from '../page'

/**
 * The Users page, for admins at `/accounts`: everyone who can sign in. Export it from the config, and put it in the
 * profile menu with `m.page('accounts', { label: 'Users', icon: 'users' })`; or make a page of your own around `<Users />`.
 */
export const usersPage = page(
  'accounts',
  <Page title="Users" description="Everyone who can sign in: invite, add, change roles and block.">
    <Users />
  </Page>,
  { roles: ['admin'], icon: 'users' },
)
