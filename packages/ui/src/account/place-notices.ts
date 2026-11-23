import type { ListingProblem } from './use-sender-refresh'

/**
 * Where the Mailbox section shows each notice of its address checks: a link that no longer works reads Not connected on its
 * Mailbox row, with its card beside it, and the other notices stay with the From addresses; a provider whose card
 * connects it, with every scope, offers no button on its row.
 */
export const placeNotices = (notices: ListingProblem[]) => {
  const expired = notices.filter(({ kind }) => kind === 'expired')
  return {
    mailbox: expired,
    fromAddresses: notices.filter(({ kind }) => kind !== 'expired'),
    notConnected: expired.map(({ provider }) => provider),
    connectElsewhere: notices.filter(({ kind }) => kind !== 'failed').map(({ provider }) => provider),
  }
}
