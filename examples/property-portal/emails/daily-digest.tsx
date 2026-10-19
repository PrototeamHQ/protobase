import { defineEmail } from '@protobase/server'
import { EmailLayout, type MailingApp } from '@protobase/server/email'
import { Text } from 'react-email'
import { ListingBlock, SearchesFooter, type AlertedListing } from './alerted-listing'

/** The listings that fit a member's daily searches since the last digest. */
export type DailyDigest = { app: MailingApp; listings: AlertedListing[]; searchesUrl: string }

const homes = (count: number) => `${count} new ${count === 1 ? 'home fits' : 'homes fit'} your searches`

const DailyDigestEmail = ({ app, listings, searchesUrl }: DailyDigest) => (
  <EmailLayout app={app} preview={homes(listings.length)} heading="Your daily digest">
    <Text>These homes were published since your last digest:</Text>
    {listings.map((listing) => (
      <ListingBlock key={listing.url} listing={listing} />
    ))}
    <SearchesFooter searchesUrl={searchesUrl} />
  </EmailLayout>
)

/** Every morning, the listings of the day before that fit a member's daily searches, in one mail. */
export const dailyDigest = defineEmail({
  name: 'daily-digest',
  subject: ({ listings }: DailyDigest) => homes(listings.length),
  component: DailyDigestEmail,
})
