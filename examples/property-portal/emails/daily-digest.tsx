import { defineEmail } from '@protobase/server'
import { Body, Container, Head, Heading, Html, Preview, Text } from 'react-email'
import { ListingBlock, SearchesFooter, type AlertedListing } from './alerted-listing'

/** The listings that fit a member's daily searches since the last digest. */
export type DailyDigest = { listings: AlertedListing[]; searchesUrl: string }

const homes = (count: number) => `${count} new ${count === 1 ? 'home fits' : 'homes fit'} your searches`

const DailyDigestEmail = ({ listings, searchesUrl }: DailyDigest) => (
  <Html lang="en">
    <Head />
    <Preview>{homes(listings.length)}</Preview>
    <Body style={{ backgroundColor: '#f4f4f5', fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <Container style={{ backgroundColor: '#ffffff', padding: '24px', maxWidth: '520px' }}>
        <Heading as="h1" style={{ fontSize: '20px' }}>
          Your daily digest
        </Heading>
        <Text>These homes were published since your last digest:</Text>
        {listings.map((listing) => (
          <ListingBlock key={`${listing.url} ${listing.search}`} listing={listing} />
        ))}
        <SearchesFooter searchesUrl={searchesUrl} />
      </Container>
    </Body>
  </Html>
)

/** Every morning, the listings of the day before that fit a member's daily searches, in one mail. */
export const dailyDigest = defineEmail({
  name: 'daily-digest',
  subject: ({ listings }: DailyDigest) => homes(listings.length),
  component: DailyDigestEmail,
})
