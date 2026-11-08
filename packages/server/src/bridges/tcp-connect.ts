import { connect, type Socket } from 'node:net'
import { HttpProblem } from '../problem'

/** How long connecting to a bridge's target may take before the bridge is refused. */
export const connectWithinMs = 10_000

const unreachable = () => new HttpProblem(502, 'target-unreachable', 'Bad Gateway', 'The bridge could not connect to its target')

/**
 * A TCP connection to `host:port`, once it is established; a refused, failed or timed out connection rejects with a
 * 502 problem that names no address, so a caller learns nothing of the private network.
 */
export const connectTcp = (host: string, port: number, withinMs = connectWithinMs) =>
  new Promise<Socket>((resolve, reject) => {
    const socket = connect({ host, port, noDelay: true })
    const fail = () => {
      socket.destroy()
      reject(unreachable())
    }
    socket.setTimeout(withinMs, fail)
    socket.once('error', fail)
    socket.once('connect', () => {
      socket.setTimeout(0)
      socket.off('error', fail)
      resolve(socket)
    })
  })
