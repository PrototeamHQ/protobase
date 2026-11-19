/**
 * Thrown when the server refuses one recipient's message of a bulk send, after the messages before it went out. It
 * fails the job try, which is retried; `sent`, the recipients who got the message, lets the job record them and leave
 * them out of the next try. The server's own error is its `cause`.
 */
export class BulkMailError extends Error {
  readonly code = 'BULK_MAIL_FAILED'

  constructor(
    /** The recipient whose message the server refused. */
    readonly to: string,
    /** Each recipient the message went to before it, with that message's id when known. */
    readonly sent: { to: string; messageId?: string }[],
    /** The recipients who unsubscribed from its topic, to whom it was not sent. */
    readonly skipped: string[],
    cause: unknown,
  ) {
    super(`The bulk message to ${to} was refused, after it went to ${sent.length} recipient(s)`, { cause })
    this.name = 'BulkMailError'
  }
}
