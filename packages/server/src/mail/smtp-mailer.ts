import { composerMessage } from './composer-message'
import type { Mailer } from './mail-message'
import type { MailSettings } from './mail-settings'
import { withinLimit } from './mail-server-timeout'

export type { MailAttachment, MailMessage, Mailer } from './mail-message'

/** The whole send, from looking up the server to the end of the message, well within an emailed code's 10 minutes. */
const sendLimitMs = 30_000

/**
 * Nodemailer's own timers, for each of the server's addresses, well under the limit so the sockets of a send that ran
 * out close soon after; its defaults run for minutes. Options on the SMTP URL override these, never the limit.
 */
const clientTimeouts = { dnsTimeout: 10_000, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 }

/**
 * Mail over SMTP with Nodemailer: the most used Node SMTP client, maintained, with no dependencies of its
 * own. It is loaded on the first message, so `@protobase/server` itself stays free of Node's network modules.
 *
 * The client greets the server (EHLO) with the sender's domain, the app's own mail name, instead of what the container
 * reports, which is often just `[127.0.0.1]` and makes receiving servers trust the mail less. A `name` query parameter
 * on the SMTP URL still overrides it. With a `name`, the From header carries it as the sender's display name.
 *
 * Over `smtp://` the client always upgrades with STARTTLS (`requireTLS`), and fails before it logs in or names a
 * sender when the server does not upgrade, so a server without TLS, or someone on the path who strips STARTTLS from
 * the server's answer, never sees the relay's password or a message. `?requireTLS=false` on the URL is the one way to
 * send in plaintext, such as to a mail catcher in development. `smtps://` is TLS from the start and ignores it.
 *
 * A send that has not finished after `limitMs` rejects with a `MailServerTimeoutError`, with no retry: a firewall that
 * drops the mail port's packets would otherwise hold it for minutes, once for each of the server's addresses.
 */
export const smtpMailer = (settings: MailSettings, limitMs = sendLimitMs): Mailer => {
  let transport: Promise<import('nodemailer').Mail> | undefined
  return {
    send: async (message) => {
      transport ??= import('nodemailer').then(({ createTransport }) => createTransport({ url: settings.smtpUrl, name: senderDomain(settings.from), requireTLS: true, ...clientTimeouts }))
      const mail = { from: sender(settings), ...composerMessage(message) }
      await withinLimit(transport.then((client) => client.sendMail(mail)), limitMs)
    },
  }
}

// Nodemailer quotes and encodes the name as the header needs, so any name is safe in it.
const sender = ({ from, name }: MailSettings) => (name ? { name, address: from } : from)

/** The domain of a sender address `readMailSettings` accepted, so always a dotted hostname. */
const senderDomain = (from: string) => from.slice(from.lastIndexOf('@') + 1)
