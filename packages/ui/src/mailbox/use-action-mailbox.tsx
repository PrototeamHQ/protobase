import type { ActionModel } from '@protobase/schema'
import { MailboxConnect } from './mailbox-connect'
import { mailboxProblem } from './mailbox-problem'
import { useMailboxOffers } from './use-mailbox-offers'

/**
 * The mailbox part of an action's dialog: for an action that sends from the person's own mailbox (`mailbox: true`),
 * an offer to connect one while none is linked; for any action whose run failed for want of a mailbox, or as its link
 * expired, the same offer for that. `notice` is the offer, which stands in for the failure's banner (`explained`), and
 * `blocked` keeps the action from running while the mailbox is checked or still needs connecting.
 */
export const useActionMailbox = (action: ActionModel, failure: unknown) => {
  const problem = mailboxProblem(failure)
  const check = action.mailbox === true
  const { offers, error, connect } = useMailboxOffers(problem, check)
  const offered = offers !== undefined && offers.length > 0
  const notice = offered ? (
    <MailboxConnect offers={offers} problem={problem} onConnect={connect} />
  ) : error ? (
    <p role="alert" className="text-body font-medium text-danger-text">
      {error}
    </p>
  ) : undefined
  return { notice, explained: problem !== undefined && offered, blocked: offered || (check && offers === undefined) }
}
