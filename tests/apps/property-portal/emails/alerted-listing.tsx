import { EmailNote } from '@protobase/server/email'
import { Hr, Link, Section, Text } from 'react-email'

/** A search of the member's that a listing fits: its name, `null` for one saved without a name, and its page. */
export type FittingSearch = { name: string | null; url: string }

/** A new listing as an alert mails it: a price empty when it is not offered that way, its page, and the searches it fits. */
export type AlertedListing = {
  address: string
  place: string
  purchasePrice: string | null
  rentPrice: string | null
  livingArea: number
  url: string
  searches: FittingSearch[]
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

const searchLabel = (search: FittingSearch) => (search.name === null ? 'one of your searches' : `"${search.name}"`)

/** The searches a listing fits, each linked to its page: Fits "Canal flat" and "Under 700k". */
const Fits = ({ searches }: { searches: FittingSearch[] }) => (
  <Text style={{ margin: '4px 0', color: '#71717a' }}>
    Fits{' '}
    {searches.map((search, index) => (
      <span key={search.url}>
        {index === 0 ? '' : index === searches.length - 1 ? ' and ' : ', '}
        <Link href={search.url}>{searchLabel(search)}</Link>
      </span>
    ))}
  </Text>
)

/** One listing of an alert: where it is, what it costs, its size, the searches it fits and a link to its page. */
export const ListingBlock = ({ listing }: { listing: AlertedListing }) => (
  <Section>
    <Hr style={{ borderColor: '#e4e4e7' }} />
    <Link href={listing.url} style={{ color: '#0f766e', fontSize: '16px', fontWeight: 600 }}>
      {listing.address}, {listing.place}
    </Link>
    <Text style={{ margin: '4px 0' }}>
      {prices(listing)}, {listing.livingArea} m²
    </Text>
    <Fits searches={listing.searches} />
  </Section>
)

/** The mail's footer: where the member changes what they hear about. */
export const SearchesFooter = ({ searchesUrl }: { searchesUrl: string }) => (
  <EmailNote>
    You get this mail for your saved searches. Change how often you hear of one, or stop, under <Link href={searchesUrl}>Searches</Link>.
  </EmailNote>
)
