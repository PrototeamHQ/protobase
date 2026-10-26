import { createServer } from 'node:net'

// Whether `port` can be listened on at `host`, undefined being every address.
const canListen = (port: number, host: string | undefined) =>
  new Promise<boolean>((resolve, reject) => {
    const server = createServer()
    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE' || error.code === 'EACCES') return resolve(false)
      reject(error)
    })
    server.listen(port, host, () => server.close(() => resolve(true)))
  })

// Docker publishes a port on every address or on 127.0.0.1 only, and macOS lets each of those listens through when only
// the other is taken, so a port is free when both succeed.
const isFree = async (port: number) => (await canListen(port, undefined)) && (await canListen(port, '127.0.0.1'))

/** The first port from `start` on, within 100, that nothing listens on. */
export const freePort = async (start: number) => {
  for (let port = start; port < start + 100; port++) {
    if (await isFree(port)) return port
  }
  throw new Error(`no free port from ${start} to ${start + 99} for the project's Postgres`)
}
