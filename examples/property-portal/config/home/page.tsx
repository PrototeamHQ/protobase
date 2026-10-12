/** @jsxImportSource @protobase/layout */
import { Grid, Page, Stat, Table, page } from '@protobase/layout'

/**
 * Where the portal opens: what is on offer and the newest listings for everyone, and a member's own alerts and
 * favorites below them. A visitor's page leaves out what they cannot read, the member's parts.
 */
export const home = page(
  'home',
  <Page title="Find a home" description="Houses and apartments for sale and for rent in the Netherlands and Spain, from the agencies on the portal.">
    <Grid columns={4}>
      <Stat label="For sale" resource="listings" filter="offer_type = 'sale' AND status = 'available'" />
      <Stat label="For rent" resource="listings" filter="offer_type = 'rent' AND status = 'available'" />
      <Stat label="Your favorites" resource="favorites" />
      <Stat label="New alerts" resource="alerts" filter="seen = false" description="Not seen yet" />
    </Grid>
    <Table title="Newest listings" resource="listings" sort="published_at desc" columns={['address', 'place_id', 'offer_type', 'property_type', 'price', 'living_area']} pageSize={8} />
    <Grid columns={2}>
      <Table title="Your new alerts" resource="alerts" filter="seen = false" sort="matched_at desc" columns={['listing_id', 'search_profile_id', 'matched_at']} pageSize={5} empty="Nothing new. Add a search profile to hear of new listings." />
      <Table title="Your favorites" resource="favorites" sort="created_at desc" columns={['listing_id', 'created_at']} pageSize={5} empty="Save a listing with Save to favorites on its page." />
    </Grid>
  </Page>,
  { nav: { group: 'Browse', order: 0 }, icon: 'layout-dashboard' },
)
