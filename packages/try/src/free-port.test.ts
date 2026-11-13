import { createServer } from 'node:net'
import { describe, expect, it } from 'vitest'
import { freePort } from './free-port'

describe('freePort', () => {
  it('skips a port something listens on', async () => {
    const server = createServer()
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const taken = (server.address() as { port: number }).port
    expect(await freePort(taken)).toBeGreaterThan(taken)
    await new Promise((resolve) => server.close(resolve))
  })
})
