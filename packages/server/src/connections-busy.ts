import { HttpProblem } from './problem'

/**
 * Every connection of the app's pool stayed in use for as long as a query may wait for one: queries that run long or
 * transactions left open hold them.
 */
export class ConnectionsBusy extends Error {
  override name = 'ConnectionsBusy'

  constructor(readonly connections: number, readonly waitedMs: number, options?: ErrorOptions) {
    super(`All ${connections} database connections stayed busy for ${waitedMs / 1000} s`, options)
  }
}

/** The 503 of `subject` (such as `GET /api/v1/tasks`), which found every connection busy and so did not run. */
export const connectionsBusyProblem = (error: ConnectionsBusy, subject: string) =>
  new HttpProblem(
    503,
    'connections-busy',
    'Service Unavailable',
    `${subject} waited ${error.waitedMs / 1000} s for one of the app's ${error.connections} database connections, which all stayed busy, so it did not run. Queries that run long or transactions left open hold them.`,
    {},
    { 'Retry-After': '1' },
  )
