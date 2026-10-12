import { bottomBar } from '@protobase/schema'

/** The mobile bottom bar of members and admins: their main screens as tabs; "More" opens the rest, notes, search profiles and the catalogue. */
export const memberBar = bottomBar({ label: 'Portal', roles: ['member', 'admin'] }, (m) => [
  m.page('home', { label: 'Home' }),
  m.resource('listings', { label: 'Listings' }),
  m.resource('favorites', { label: 'Favorites' }),
  m.resource('alerts', { label: 'Alerts' }),
])

/** The mobile bottom bar of a visitor who is not signed in: the home page and the listings, all they can open. */
export const visitorBar = bottomBar({ label: 'Browse', roles: ['anonymous'] }, (m) => [
  m.page('home', { label: 'Home' }),
  m.resource('listings', { label: 'Listings' }),
])
