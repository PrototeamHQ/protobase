/** @jsxImportSource @protobase/layout */
import { Grid, Page, Stat, Table, page } from '@protobase/layout'

/**
 * Where the portal opens: what is on offer and the newest listings for everyone, and what a member's searches found
 * and their favorites below them. A visitor's page leaves out what they cannot read, the member's parts.
 */
export const home = page(
  'home',
  <Page title="Find a home" description="Houses and apartments for sale and for rent in the Netherlands and Spain, from the agencies on the portal.">
    <Grid columns={4}>
      <Stat label="For sale" resource="listings" filter="for_sale = true AND status = 'available'" />
      <Stat label="For rent" resource="listings" filter="for_rent = true AND status = 'available'" />
      <Stat label="Your favorites" resource="favorites" />
      <Stat label="Your searches" resource="saved_searches" />
    </Grid>
    <Table title="Newest listings" resource="listings" sort="published_at desc" columns={['address', 'place_id', 'property_type', 'purchase_price', 'rent_price', 'living_area']} limit={8} />
    <Grid columns={2}>
      <Table title="Found by your searches" resource="alerts" sort="matched_at desc" columns={['listing_id', 'saved_search_id', 'matched_at']} limit={5} empty="Nothing yet. Filter the listings and save the search to hear of new ones." />
      <Table title="Your favorites" resource="favorites" sort="created_at desc" columns={['listing_id', 'created_at']} limit={5} empty="Save a listing with Save to favorites on its page." />
    </Grid>
  </Page>,
  { nav: { group: 'Browse', order: 0 }, icon: 'layout-dashboard' },
)
