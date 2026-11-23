import type { MailSenderRow } from './sender-store'

/**
 * Where a From address stands, derived from what vouches for it each time it is read: `verified` when the provider's
 * last listing says the mailbox may send as it; `pending` while its owner still has to confirm it with the provider;
 * `failed` when a complete listing since it was known did not hold it, so the provider would send from another
 * address; `unverified` when nothing says either way, as for a typed address on a mailbox that cannot list. A removed
 * address is `removed`, and one on no usable connection `detached`: neither is sent from.
 */
export type SenderAddressState = 'unverified' | 'pending' | 'verified' | 'failed'

export type SenderRowState = SenderAddressState | 'removed' | 'detached'

type Evidence = Pick<MailSenderRow, 'typedAt' | 'listedAt' | 'providerState' | 'providerStateReadAt' | 'removedAt'>

/** Whether the person removed the address and has not typed it again since. */
export const isRemoved = ({ removedAt, typedAt }: Pick<Evidence, 'removedAt' | 'typedAt'>) => removedAt !== null && (typedAt === null || removedAt >= typedAt)

/** Whether a listing read the address after its owner last removed it: an older listing no longer counts. */
export const hasListing = ({ providerStateReadAt, removedAt }: Pick<Evidence, 'providerStateReadAt' | 'removedAt'>) =>
  providerStateReadAt !== null && (removedAt === null || providerStateReadAt > removedAt)

/**
 * The state of `row`, with `connected` whether its connection is still one of its owner's that can send, and `provedAt`
 * when a verifier last proved it, by a verification that still counts. Only a provider state of `verified` or
 * `pending` makes a claim: any other value, as an unknown one, makes none. Where the provider makes none, a proof since
 * the address was last removed makes it `verified`; it never outweighs what the provider says.
 */
export const senderRowState = (row: Evidence, connected: boolean, provedAt?: Date): SenderRowState => {
  if (isRemoved(row)) return 'removed'
  if (!connected) return 'detached'
  const proved = provedAt !== undefined && (row.removedAt === null || provedAt > row.removedAt)
  if (!hasListing(row)) return proved ? 'verified' : 'unverified'
  if (row.listedAt === null) return 'failed'
  if (row.providerState === 'verified') return 'verified'
  if (row.providerState === 'pending') return 'pending'
  return proved ? 'verified' : 'unverified'
}
