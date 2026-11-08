import { connect as http2Connect, type ClientHttp2Session } from 'node:http2'

/** Opens an HTTP/2 session to an APNs origin. The built-in one verifies the server's certificate, as `node:http2` does by default. */
export type ApnsConnect = (origin: string) => ClientHttp2Session

const verifiedConnect: ApnsConnect = (origin) => http2Connect(origin)

/**
 * One HTTP/2 session per APNs origin, reused by every request to it; there are two origins, so it keeps at most two.
 * A session APNs closes (GOAWAY), that closes or that fails is dropped, and the next request opens a new one. Sessions
 * do not keep the process running.
 */
export const apnsSessions = (connect: ApnsConnect = verifiedConnect) => {
  const open = new Map<string, ClientHttp2Session>()

  return (origin: string) => {
    const kept = open.get(origin)
    if (kept && !kept.closed && !kept.destroyed) return kept
    const session = connect(origin)
    const drop = () => {
      if (open.get(origin) === session) open.delete(origin)
    }
    session.on('goaway', () => {
      drop()
      session.close()
    })
    session.on('close', drop)
    // A failed session fails its streams too, and each request answers for its own; the session is only dropped here.
    session.on('error', drop)
    session.unref()
    open.set(origin, session)
    return session
  }
}
