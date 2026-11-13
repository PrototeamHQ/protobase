import { createServer } from 'node:net'

const isFree = (port: number) =>
  new Promise<boolean>((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)))
  })

/** The first of `from` and the 19 ports after it that nothing listens on. */
export const freePort = async (from: number) => {
  for (let port = from; port < from + 20; port++) if (await isFree(port)) return port
  throw new Error(`ports ${from} to ${from + 19} are all taken`)
}
