import { HttpProblem } from '../problem'

/**
 * Thrown, sending nothing, when a message names a From address the sender may not use: not their mailbox's own, not
 * one they entered, and not one another person shared. Out of a function it answers as a 403 problem naming the address.
 * A private address of someone else is refused the same way, so the answer does not tell that it exists.
 */
export class MailSenderRefusedError extends HttpProblem {
  constructor(readonly address: string) {
    super(403, 'mail-sender-refused', 'Forbidden', `You may not send mail from ${address}: add it to the Mailbox section of your account page first`, { address })
  }
}
