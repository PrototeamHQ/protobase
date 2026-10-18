type ErrorEmitter = { on(event: 'error', listener: (error: Error) => void): unknown }
type Pool = ErrorEmitter & { on(event: 'connect', listener: (client: ErrorEmitter) => void): unknown }

// A pg connection that drops (a database restart) emits 'error' on its client, and on the pool too when it was idle;
// with no listener Node exits. The pool drops that client and the next query opens a new connection.
export const handleDroppedConnections = <P extends Pool>(pool: P) => {
  pool.on('connect', (client) => client.on('error', (error) => console.error(`Lost a database connection: ${error.message}`)))
  // Already printed by the client's own listener above; the pool only needs a listener so the error is not fatal.
  pool.on('error', () => {})
  return pool
}
