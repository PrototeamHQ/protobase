import type { AddressInfo } from 'node:net'
import { SMTPServer } from 'smtp-server'

export const relayCredential = { username: 'tenant-acme', password: 'relay-s3cret' }

export type Received = { from: string; to: string[]; user: string | undefined; raw: string }

/** An SMTP server in this process, as the platform's relay: it asks for the tenant's credential and keeps every message. */
export const startFakeRelay = async () => {
  const received: Received[] = []
  const waiting: Array<(message: Received) => void> = []
  const server = new SMTPServer({
    disabledCommands: ['STARTTLS'],
    allowInsecureAuth: true,
    onAuth: (auth, _session, callback) =>
      auth.username === relayCredential.username && auth.password === relayCredential.password ? callback(null, { user: auth.username }) : callback(new Error('Invalid credentials')),
    onData: (stream, session, callback) => {
      const chunks: Buffer[] = []
      stream.on('data', (chunk: Buffer) => chunks.push(chunk))
      stream.on('end', () => {
        const message = {
          from: session.envelope.mailFrom ? session.envelope.mailFrom.address : '',
          to: session.envelope.rcptTo.map((rcpt) => rcpt.address),
          user: session.user,
          raw: Buffer.concat(chunks).toString(),
        }
        const waiter = waiting.shift()
        if (waiter) waiter(message)
        else received.push(message)
        callback()
      })
    },
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.server.address() as AddressInfo).port
  const next = () => {
    const ready = received.shift()
    return ready ? Promise.resolve(ready) : new Promise<Received>((resolve) => waiting.push(resolve))
  }
  const smtpUrl = `smtp://${relayCredential.username}:${relayCredential.password}@127.0.0.1:${port}`
  return { port, smtpUrl, next, received, close: () => new Promise<void>((resolve) => server.close(() => resolve())) }
}

// Long lines of a plain-text body are sent quoted-printable: undo the soft line breaks and `=XX` escapes.
const decodeQuotedPrintable = (text: string) => text.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))

export const bodyOf = (raw: string) => decodeQuotedPrintable(raw.slice(raw.indexOf('\r\n\r\n') + 4))
