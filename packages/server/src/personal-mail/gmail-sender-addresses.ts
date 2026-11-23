import type { ListingConnection, SenderAddressListing } from './personal-mail-provider'
import { gmailError, gmailReason } from './gmail-errors'
import { PersonalMailError } from './personal-mail-error'
import { SenderListingError } from './personal-mail-provider'
import { senderAddressOf } from './sender-address-input'

/** The narrowest scope that reads the send-as addresses, which an app adds to the Gmail link to list them. */
export const gmailSettingsScope = 'https://www.googleapis.com/auth/gmail.settings.basic'

// Every scope Gmail's reference names for `users.settings.sendAs.list`: a link may hold a broader one for another reason.
const listingScopes = [gmailSettingsScope, 'https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.modify', 'https://mail.google.com/']

export const gmailSendAsUrl = 'https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs'

type SendAs = { sendAsEmail?: unknown; isPrimary?: unknown; verificationStatus?: unknown }

// The primary address is the account itself, which Gmail always sends as; a custom alias it vouches for is `accepted`.
// `verificationStatus` applies only to custom aliases, and any value but those two makes no claim.
const stateOf = (entry: SendAs) => {
  if (entry.isPrimary === true || entry.verificationStatus === 'accepted') return 'verified' as const
  if (entry.verificationStatus === 'pending') return 'pending' as const
  return
}

const incomplete = (why: string) => new SenderListingError(`Gmail's send-as list came back incomplete: ${why}`)

/**
 * The send-as addresses of the Gmail account, through `users.settings.sendAs.list`, which answers them all at once:
 * the reference names no paging. The listing is only taken as complete when every entry is a usable address and no
 * page token says there are more; otherwise it is an error, so absence from it never counts against an address.
 */
export const listGmailSenderAddresses = async (fetcher: typeof fetch, { accessToken, scopes }: ListingConnection): Promise<SenderAddressListing> => {
  if (!scopes.some((scope) => listingScopes.includes(scope))) return { kind: 'not_permitted', missing_scopes: [gmailSettingsScope] }
  const response = await reach(() => fetcher(gmailSendAsUrl, { headers: { authorization: `Bearer ${accessToken}` } }))
  if (response.status === 401) throw new PersonalMailError('link_expired', 'gmail')
  if (response.status === 403) {
    // The link the app stored names a scope Google no longer honours, as when the person took it back.
    if (gmailReason(await gmailError(response)) === 'insufficientPermissions') return { kind: 'not_permitted', missing_scopes: [gmailSettingsScope] }
    throw new SenderListingError('Gmail refused the send-as list: 403')
  }
  if (!response.ok) throw new SenderListingError(`Gmail refused the send-as list: ${response.status} ${response.statusText}`)
  const body = await jsonBody(response)
  if (!body || typeof body !== 'object' || !Array.isArray((body as { sendAs?: unknown }).sendAs)) throw incomplete('no sendAs list')
  if ('nextPageToken' in body) throw incomplete('a page token')
  const addresses = ((body as { sendAs: SendAs[] }).sendAs).map((entry) => {
    const address = entry && typeof entry === 'object' ? senderAddressOf(entry.sendAsEmail) : undefined
    if (!address) throw incomplete('an entry that is not an address')
    const provider_state = stateOf(entry)
    return { address, ...(provider_state && { provider_state }) }
  })
  return { kind: 'listed', addresses }
}

// `fetch` rejects with a TypeError when Gmail cannot be reached at all.
const reach = async (call: () => Promise<Response>) => {
  try {
    return await call()
  } catch (error) {
    if (error instanceof TypeError) throw new SenderListingError(`Gmail could not be reached: ${error.message}`)
    throw error
  }
}

const jsonBody = async (response: Response): Promise<unknown> => {
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch (error) {
    if (error instanceof SyntaxError) throw incomplete('a body that is not JSON')
    throw error
  }
}
