import { userMenu } from '@protobase/schema'

/** Account pages under the signed-in user instead of in the sidebar, then help. */
export const accountMenu = userMenu((m) => [
  m.resource('organizations', { label: 'Organization', icon: 'building' }),
  m.resource('users', { label: 'Users', icon: 'users' }),
  m.link('Documentation', 'https://docs.protobase.net', { icon: 'book-open' }),
  m.link('Support', 'mailto:support@example.com', { icon: 'life-buoy' }),
])
