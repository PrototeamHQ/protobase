import { userMenu } from '@protobase/schema'

/** The profile menu's own pages: Users, for admins. */
export const accountMenu = userMenu((m) => [m.page('accounts', { label: 'Users', icon: 'users' })])
