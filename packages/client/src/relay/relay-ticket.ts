import { isApiError } from '../problem'
import type { Transport } from '../transport'
import type { RelayTicket } from './relay-socket'

/** A ticket from the app's `POST /api/relay/ticket`, for one connection to the relay. */
export const fetchTicket = async (send: Transport): Promise<RelayTicket> => (await send({ method: 'POST', path: '/relay/ticket', body: {}, system: true, cache: 'no-store' })).json() as Promise<RelayTicket>

/**
 * Whether the app refused a ticket for good, as a client error: no relay configured, no session of the app, or one that
 * ended. A network error or a server error is tried again.
 */
export const ticketRefused = (error: unknown) => isApiError(error) && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429
