import { bottomBar } from '@protobase/schema'

/** The mobile bottom bar of members and admins: their main screens as tabs; "More" opens the rest, alerts, notes and the catalogue. */
export const memberBar = bottomBar({ label: 'Portal', roles: ['member', 'admin'] }, (m) => [
  m.page('home', { label: 'Home' }),
  m.resource('listings', { label: 'Listings' }),
  m.resource('favorites', { label: 'Favorites', icon: 'heart' }),
  m.resource('saved_searches', { label: 'Searches', icon: 'bookmark' }),
])

/** The mobile bottom bar of a visitor who is not signed in: the home page, the listings, and favorites and searches, which tell them to sign in. */
export const visitorBar = bottomBar({ label: 'Browse', roles: ['anonymous'] }, (m) => [
  m.page('home', { label: 'Home' }),
  m.resource('listings', { label: 'Listings' }),
  m.resource('favorites', { label: 'Favorites', icon: 'heart' }),
  m.resource('saved_searches', { label: 'Searches', icon: 'bookmark' }),
])
