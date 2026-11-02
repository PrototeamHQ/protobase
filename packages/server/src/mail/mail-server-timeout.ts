/**
 * Thrown when a send through the SMTP server does not finish in time, as when a firewall drops the mail port's packets
 * or the server never greets. Its `code`, `MAIL_SERVER_TIMEOUT`, tells it apart from a server that answered and refused,
 * whose errors keep Nodemailer's own codes, such as `EAUTH` for a refused login or `EENVELOPE` for a refused sender.
 */
export class MailServerTimeoutError extends Error {
  readonly code = 'MAIL_SERVER_TIMEOUT'

  constructor(limitMs: number, cause?: unknown) {
    super(`The mail server did not answer within ${limitMs / 1000} seconds`, { cause })
    this.name = 'MailServerTimeoutError'
  }
}

/**
 * Settles with `sending`, or rejects with a `MailServerTimeoutError` once `limitMs` has passed, whatever timers the
 * client runs. A client's own timeout (`ETIMEDOUT`) is the same failure, so it becomes this error too, its cause kept.
 */
export const withinLimit = <T>(sending: Promise<T>, limitMs: number) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new MailServerTimeoutError(limitMs)), limitMs)
    sending
      .then(resolve, (error) => reject(isTimeout(error) ? new MailServerTimeoutError(limitMs, error) : error))
      .finally(() => clearTimeout(timer))
  })

const isTimeout = (error: unknown) => (error as { code?: unknown } | null)?.code === 'ETIMEDOUT'
