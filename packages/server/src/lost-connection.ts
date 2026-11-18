/**
 * A statement on a database connection that dropped, such as a terminated session, an idle-transaction timeout or a
 * network drop: its message names why the connection dropped, and `cause` is the connection's own error.
 */
export class LostConnection extends Error {
  override name = 'LostConnection'

  constructor(reason: Error) {
    super(`Lost the database connection: ${reason.message}`, { cause: reason })
  }
}
