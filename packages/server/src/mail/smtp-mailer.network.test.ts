import { createServer, type Server, type Socket } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { smtpMailer } from './smtp-mailer'

// Against a real SMTP client and a local listener, so Nodemailer is not mocked here as it is in smtp-mailer.test.ts.
const servers: Server[] = []
const sockets: Socket[] = []

const listen = async (onConnection: (socket: Socket) => void) => {
  const server = createServer((socket) => {
    sockets.push(socket)
    onConnection(socket)
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as { port: number }
  return `smtp://127.0.0.1:${port}`
}

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.destroy()
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))))
})

const message = { to: 'ada@example.com', subject: 'Hello', text: 'Hello' }

describe('smtpMailer against a local listener', () => {
  it('rejects within the limit when the server accepts the connection and never greets', async () => {
    const smtpUrl = await listen(() => {})
    const mailer = smtpMailer({ smtpUrl, from: 'noreply@shop.example.com' }, 300)
    const started = Date.now()
    await expect(mailer.send(message)).rejects.toMatchObject({ code: 'MAIL_SERVER_TIMEOUT', message: 'The mail server did not answer within 0.3 seconds' })
    expect(Date.now() - started).toBeLessThan(2000)
  })

  it('keeps the code of a server that answers and refuses', async () => {
    const smtpUrl = await listen((socket) => socket.end('554 5.7.1 No service here\r\n'))
    const mailer = smtpMailer({ smtpUrl, from: 'noreply@shop.example.com' }, 5000)
    const error = await mailer.send(message).catch((caught: unknown) => caught)
    expect(error).toMatchObject({ code: 'EPROTOCOL', responseCode: 554 })
  })
})
