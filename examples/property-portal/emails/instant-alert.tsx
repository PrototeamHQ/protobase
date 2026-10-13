import { defineEmail } from '@protobase/server'
import { Body, Container, Head, Heading, Html, Preview } from 'react-email'
import { ListingBlock, SearchesFooter, type AlertedListing } from './alerted-listing'

/** The new listings that fit a member's instant searches since their last mail: usually one. */
export type InstantAlert = { listings: AlertedListing[]; searchesUrl: string }

const InstantAlertEmail = ({ listings, searchesUrl }: InstantAlert) => (
  <Html lang="en">
    <Head />
    <Preview>{listings.length === 1 ? `${listings[0]!.address}, ${listings[0]!.place}` : `${listings.length} new homes`} fit your search</Preview>
    <Body style={{ backgroundColor: '#f4f4f5', fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <Container style={{ backgroundColor: '#ffffff', padding: '24px', maxWidth: '520px' }}>
        <Heading as="h1" style={{ fontSize: '20px' }}>
          {listings.length === 1 ? 'A new home fits your search' : 'New homes fit your searches'}
        </Heading>
        {listings.map((listing) => (
          <ListingBlock key={`${listing.url} ${listing.search}`} listing={listing} />
        ))}
        <SearchesFooter searchesUrl={searchesUrl} />
      </Container>
    </Body>
  </Html>
)

/** Mailed as soon as a listing fits a search set to mail at once. */
export const instantAlert = defineEmail({
  name: 'instant-alert',
  subject: ({ listings }: InstantAlert) => (listings.length === 1 ? `New: ${listings[0]!.address}, ${listings[0]!.place}` : `${listings.length} new homes fit your searches`),
  component: InstantAlertEmail,
})
