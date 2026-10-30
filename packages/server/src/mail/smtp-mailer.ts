import { composerMessage } from './composer-message'
import type { Mailer } from './mail-message'
import type { MailSettings } from './mail-settings'

export type { MailAttachment, MailMessage, Mailer } from './mail-message'

/**
 * Mail over SMTP with Nodemailer: the most used Node SMTP client, maintained, with no dependencies of its
 * own. It is loaded on the first message, so `@protobase/server` itself stays free of Node's network modules.
 *
 * The client greets the server (EHLO) with the sender's domain, the app's own mail name, instead of what the container
 * reports, which is often just `[127.0.0.1]` and makes receiving servers trust the mail less. A `name` query parameter
 * on the SMTP URL still overrides it. With a `name`, the From header carries it as the sender's display name.
 */
export const smtpMailer = (settings: MailSettings): Mailer => {
  let transport: Promise<import('nodemailer').Mail> | undefined
  return {
    send: async (message) => {
      transport ??= import('nodemailer').then(({ createTransport }) => createTransport({ url: settings.smtpUrl, name: senderDomain(settings.from) }))
      await (await transport).sendMail({ from: sender(settings), ...composerMessage(message) })
    },
  }
}

// Nodemailer quotes and encodes the name as the header needs, so any name is safe in it.
const sender = ({ from, name }: MailSettings) => (name ? { name, address: from } : from)

/** The domain of a sender address `readMailSettings` accepted, so always a dotted hostname. */
const senderDomain = (from: string) => from.slice(from.lastIndexOf('@') + 1)
