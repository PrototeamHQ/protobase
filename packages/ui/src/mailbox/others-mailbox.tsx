import { ActionCard } from '../action-card/action-card'
import type { MailboxProblem } from './mailbox-problem'
import { text } from './messages'

/**
 * Why mail cannot go out from an address another person shared: their mailbox is not connected, or its link expired.
 * Only they can connect it again, so it offers the sender nothing to connect.
 */
export const OthersMailbox = ({ problem }: { problem: MailboxProblem }) => (
  <ActionCard title={text('othersTitle')} tone="warning">
    <p className="text-body">{text(problem.code === 'link_expired' ? 'othersExpired' : 'othersMissing', { address: problem.address ?? '' })}</p>
  </ActionCard>
)
