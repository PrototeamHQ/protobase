import { createServer, type Server } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { freePort } from './free-port'

const servers: Server[] = []
const listen = (host?: string) =>
  new Promise<number>((resolve) => {
    const server = createServer()
    servers.push(server)
    server.listen(0, host, () => resolve((server.address() as { port: number }).port))
  })

afterEach(() => {
  for (const server of servers.splice(0)) server.close()
})

describe('freePort', () => {
  it('skips a port taken on every address', async () => {
    const taken = await listen()
    expect(await freePort(taken)).toBeGreaterThan(taken)
  })

  it('skips a port taken on 127.0.0.1 only', async () => {
    const taken = await listen('127.0.0.1')
    expect(await freePort(taken)).toBeGreaterThan(taken)
  })
})
