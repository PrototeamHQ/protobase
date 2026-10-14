/**
 * An error the app's code threw while a change was dispatched: an event's `match` or filter, a subscription's `when`, or
 * an access rule of the roles it delivers as. Dispatch keeps the change as failed and moves on; any other error, such
 * as the database's, fails the whole dispatch, which is retried.
 */
export class EventCodeError extends Error {
  override name = 'EventCodeError'

  constructor(what: string, error: unknown) {
    super(`${what} threw: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }
}
