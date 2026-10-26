import { defineEmail } from '@protobase/server'
import { EmailLayout, type MailingApp } from '@protobase/server/email'
import { ListingBlock, SearchesFooter, type AlertedListing } from './alerted-listing'

/** The new listings that fit a member's instant searches since their last mail: usually one. */
export type InstantAlert = { app: MailingApp; listings: AlertedListing[]; searchesUrl: string }

const InstantAlertEmail = ({ app, listings, searchesUrl }: InstantAlert) => (
  <EmailLayout
    app={app}
    preview={`${listings.length === 1 ? `${listings[0]!.address}, ${listings[0]!.place}` : `${listings.length} new homes`} fit your search`}
    heading={listings.length === 1 ? 'A new home fits your search' : 'New homes fit your searches'}
  >
    {listings.map((listing) => (
      <ListingBlock key={listing.url} listing={listing} />
    ))}
    <SearchesFooter searchesUrl={searchesUrl} />
  </EmailLayout>
)

/** Mailed as soon as a listing fits a search set to mail at once. */
export const instantAlert = defineEmail({
  name: 'instant-alert',
  subject: ({ listings }: InstantAlert) => (listings.length === 1 ? `New: ${listings[0]!.address}, ${listings[0]!.place}` : `${listings.length} new homes fit your searches`),
  component: InstantAlertEmail,
})
