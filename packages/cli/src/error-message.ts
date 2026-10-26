type NetworkError = Error & { code?: string; address?: string; port?: number }

const target = ({ address, port }: NetworkError) => (address?.includes(':') ? `[${address}]:${port}` : `${address}:${port}`)

/**
 * The line the central error handler prints for an error. A connection to a host with several addresses, such as
 * localhost's ::1 and 127.0.0.1, fails with an AggregateError of one error per address and no message of its own.
 */
export const errorMessage = (error: Error): string => {
  if (error.message) return error.message
  if (!(error instanceof AggregateError) || error.errors.length === 0) return error.name
  const errors = error.errors as NetworkError[]
  if (errors.every((inner) => inner.code === 'ECONNREFUSED' && inner.address)) {
    return `Cannot connect to ${errors.map(target).join(' or ')}: the connection was refused, so nothing is listening there. Is the database running?`
  }
  return errors.map(errorMessage).join('; ')
}
