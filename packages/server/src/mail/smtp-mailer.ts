import type { MailSettings } from './mail-settings'

export type MailMessage = { to: string; subject: string; text: string }

/** Sends one message; rejects when the server refuses it. */
export type Mailer = { send: (message: MailMessage) => Promise<void> }

/**
 * Plain-text mail over SMTP with Nodemailer: the most used Node SMTP client, maintained, with no dependencies of its
 * own. It is loaded on the first message, so `@protobase/server` itself stays free of Node's network modules.
 *
 * The client greets the server (EHLO) with the sender's domain, the app's own mail name, instead of what the container
 * reports, which is often just `[127.0.0.1]` and makes receiving servers trust the mail less. A `name` query parameter
 * on the SMTP URL still overrides it.
 */
export const smtpMailer = (settings: MailSettings): Mailer => {
  let transport: Promise<import('nodemailer').Mail> | undefined
  return {
    send: async (message) => {
      transport ??= import('nodemailer').then(({ createTransport }) => createTransport({ url: settings.smtpUrl, name: senderDomain(settings.from) }))
      await (await transport).sendMail({ from: settings.from, ...message })
    },
  }
}

/** The domain of a sender address `readMailSettings` accepted, so always a dotted hostname. */
const senderDomain = (from: string) => from.slice(from.lastIndexOf('@') + 1)
