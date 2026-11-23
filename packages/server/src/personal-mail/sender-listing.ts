import type { LinkedAccounts } from './linked-accounts'
import type { MailboxConnection } from './mailbox-connections'
import { PersonalMailError } from './personal-mail-error'
import { SenderListingError } from './personal-mail-provider'
import type { MailSenderStore } from './sender-store'

/**
 * How a listing of one connection went: `listed`, its addresses are recorded; `not_permitted`, the link lacks
 * `missing_scopes`, so reconnecting with them lets it list; `error`, with `code` `link_expired` when the provider no
 * longer honours the link, or `listing_failed`. Only `listed` records anything.
 */
export type ConnectionListing = { connection: string; provider: string } & (
  | { status: 'listed' }
  | { status: 'not_permitted'; missing_scopes: string[] }
  | { status: 'error'; code: 'link_expired' | 'listing_failed' }
)

type Lister = { accounts: LinkedAccounts; senders: MailSenderStore; userId: string; now: () => Date }

/**
 * Lists the send-as addresses of one connection whose provider can, and records them (`recordListing`), as of the
 * moment it asked: an address typed while it listed keeps what was typed. Rejects as its provider and the token
 * refresh do, recording nothing.
 */
export const listConnection = async ({ accounts, senders, userId, now }: Lister, { account, provider }: MailboxConnection): Promise<ConnectionListing> => {
  const list = provider.list_sender_addresses
  if (!list) throw new Error(`${provider.name} cannot list send-as addresses`)
  const readAt = now()
  const accessToken = await accounts.accessToken(userId, account, provider.id)
  const listing = await list({ accessToken, scopes: account.scopes })
  const named = { connection: account.id, provider: provider.id }
  if (listing.kind === 'not_permitted') return { ...named, status: 'not_permitted', missing_scopes: listing.missing_scopes }
  await senders.recordListing(userId, account.id, listing.addresses, readAt)
  return { ...named, status: 'listed' }
}

/**
 * Lists every connection of `connections` whose provider can, one after another, each on its own: a connection whose
 * token or listing fails answers its `error` and changes nothing, and the others still list. Errors of another kind
 * are thrown once every connection had its turn.
 */
export const listConnections = async (lister: Lister, connections: MailboxConnection[]) => {
  const results: ConnectionListing[] = []
  const unexpected: unknown[] = []
  for (const connection of connections.filter(({ provider }) => provider.list_sender_addresses)) {
    const named = { connection: connection.account.id, provider: connection.provider.id }
    try {
      results.push(await listConnection(lister, connection))
    } catch (error) {
      if (error instanceof PersonalMailError) results.push({ ...named, status: 'error', code: 'link_expired' })
      else if (error instanceof SenderListingError) results.push({ ...named, status: 'error', code: 'listing_failed' })
      else unexpected.push(error)
    }
  }
  if (unexpected.length === 1) throw unexpected[0]
  if (unexpected.length > 1) throw new AggregateError(unexpected, 'Listing the send-as addresses failed')
  return results
}
