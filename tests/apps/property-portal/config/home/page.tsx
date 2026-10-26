/** @jsxImportSource @protobase/layout */
import { Page, RecordRow, page } from '@protobase/layout'

/**
 * Where the portal opens: rows of the listings on offer, each with its filters and how many there are, and the newest,
 * for everyone; and a member's favorites and what each of their searches finds below them. A visitor's page leaves out
 * what they cannot read, the member's parts.
 */
export const home = page(
  'home',
  <Page title="Find a home" description="Houses and apartments for sale and for rent in the Netherlands and Spain, from the agencies on the portal.">
    <RecordRow title="For sale" resource="listings" filter="for_sale = true AND status = 'available'" sort="published_at desc" />
    <RecordRow title="For rent" resource="listings" filter="for_rent = true AND status = 'available'" sort="published_at desc" />
    <RecordRow title="Newest listings" resource="listings" sort="published_at desc" limit={24} />
    <RecordRow title="Your searches" resource="saved_searches" empty="Nothing yet. Filter the listings and save the search to hear of new ones." />
    <RecordRow title="Your favorites" resource="favorites" empty="Save a listing with the heart on its card." />
  </Page>,
  { nav: { group: 'Browse', order: 0 }, icon: 'layout-dashboard' },
)
