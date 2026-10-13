import { Hr, Link, Section, Text } from 'react-email'

/** A new listing as an alert mails it: a price empty when it is not offered that way, and its page on the portal. */
export type AlertedListing = {
  address: string
  place: string
  purchasePrice: string | null
  rentPrice: string | null
  livingArea: number
  /** The name of the saved search it fits. */
  search: string
  url: string
}

const euros = (amount: string) => `€${Math.round(Number(amount)).toLocaleString('en-GB')}`

/** What it costs each way it is offered: "For sale: €650,000 or for rent: €2,100 a month". */
export const prices = (listing: Pick<AlertedListing, 'purchasePrice' | 'rentPrice'>) => {
  const offers = [
    ...(listing.purchasePrice === null ? [] : [`for sale: ${euros(listing.purchasePrice)}`]),
    ...(listing.rentPrice === null ? [] : [`for rent: ${euros(listing.rentPrice)} a month`]),
  ].join(' or ')
  return offers.charAt(0).toUpperCase() + offers.slice(1)
}

/** One listing of an alert: where it is, what it costs, its size, the search it fits and a link to its page. */
export const ListingBlock = ({ listing }: { listing: AlertedListing }) => (
  <Section>
    <Hr style={{ borderColor: '#e4e4e7' }} />
    <Link href={listing.url} style={{ color: '#0f766e', fontSize: '16px', fontWeight: 600 }}>
      {listing.address}, {listing.place}
    </Link>
    <Text style={{ margin: '4px 0' }}>
      {prices(listing)}, {listing.livingArea} m²
    </Text>
    <Text style={{ margin: '4px 0', color: '#71717a' }}>Fits "{listing.search}"</Text>
  </Section>
)

/** The mail's footer: where the member changes what they hear about. */
export const SearchesFooter = ({ searchesUrl }: { searchesUrl: string }) => (
  <Text style={{ color: '#71717a', fontSize: '13px' }}>
    Change how often you hear of a search, or stop, under <Link href={searchesUrl}>Searches</Link>.
  </Text>
)
