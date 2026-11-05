/**
 * Why a connection gave no token: `not_connected` when the workflow has no sign-in for it, `link_expired` when the
 * provider refused it, so its owner must sign in again. A trigger that throws it waits for that sign-in.
 */
export class ConnectionError extends Error {
  constructor(
    readonly code: 'not_connected' | 'link_expired',
    message: string,
  ) {
    super(message)
    this.name = 'ConnectionError'
  }
}
