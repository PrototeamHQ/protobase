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

/**
 * A server that accepts every command, offering STARTTLS only when told to, and records each command it receives.
 * It never actually upgrades: a STARTTLS gets a refusal, so a client that asks for it stops there.
 */
const scriptedServer = (offerStartTls: boolean, commands: string[]) => (socket: Socket) => {
  let inData = false
  let buffered = ''
  const answer = (line: string) => {
    if (inData) {
      if (line === '.') {
        inData = false
        socket.write('250 2.0.0 Queued\r\n')
      }
      return
    }
    commands.push(line)
    const verb = line.split(' ')[0]!.toUpperCase()
    if (verb === 'EHLO') socket.write(`250-relay.example.net\r\n250-AUTH PLAIN LOGIN\r\n${offerStartTls ? '250-STARTTLS\r\n' : ''}250 8BITMIME\r\n`)
    else if (verb === 'STARTTLS') socket.write('454 4.7.0 TLS not available\r\n')
    else if (verb === 'AUTH') socket.write('235 2.7.0 Accepted\r\n')
    else if (verb === 'DATA') {
      inData = true
      socket.write('354 Go ahead\r\n')
    } else if (verb === 'QUIT') socket.end('221 Bye\r\n')
    else socket.write('250 OK\r\n')
  }
  socket.on('data', (chunk: Buffer) => {
    buffered += chunk.toString()
    const lines = buffered.split('\r\n')
    buffered = lines.pop()!
    for (const line of lines) answer(line)
  })
  socket.write('220 relay.example.net ESMTP\r\n')
}

const withCredential = (smtpUrl: string) => smtpUrl.replace('smtp://', 'smtp://tenant:s3cret@')
const verbs = (commands: string[]) => commands.map((command) => command.split(' ')[0])

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

  it('refuses to go on when the server does not offer STARTTLS, before logging in or naming a sender', async () => {
    const commands: string[] = []
    const smtpUrl = withCredential(await listen(scriptedServer(false, commands)))
    const mailer = smtpMailer({ smtpUrl, from: 'noreply@shop.example.com' }, 5000)
    await expect(mailer.send(message)).rejects.toMatchObject({ code: 'ETLS' })
    expect(verbs(commands)).toEqual(['EHLO', 'STARTTLS'])
  })

  it('asks for STARTTLS first when the server offers it, never logging in before it', async () => {
    const commands: string[] = []
    const smtpUrl = withCredential(await listen(scriptedServer(true, commands)))
    const mailer = smtpMailer({ smtpUrl, from: 'noreply@shop.example.com' }, 5000)
    await expect(mailer.send(message)).rejects.toMatchObject({ code: 'ETLS' })
    expect(verbs(commands)).toEqual(['EHLO', 'STARTTLS'])
  })

  it('sends in plaintext only when the URL says requireTLS=false', async () => {
    const commands: string[] = []
    const smtpUrl = `${withCredential(await listen(scriptedServer(false, commands)))}?requireTLS=false`
    const mailer = smtpMailer({ smtpUrl, from: 'noreply@shop.example.com' }, 5000)
    await mailer.send(message)
    expect(verbs(commands)).toEqual(['EHLO', 'AUTH', 'MAIL', 'RCPT', 'DATA'])
  })
})
