import type { MailSettings } from './mail-settings'

export type MailMessage = { to: string; subject: string; text: string }

/** Sends one message; rejects when the server refuses it. */
export type Mailer = { send: (message: MailMessage) => Promise<void> }

/**
 * Plain-text mail over SMTP with Nodemailer: the most used Node SMTP client, maintained, with no dependencies of its
 * own. It is loaded on the first message, so `@protobase/server` itself stays free of Node's network modules.
 */
export const smtpMailer = (settings: MailSettings): Mailer => {
  let transport: Promise<import('nodemailer').Mail> | undefined
  return {
    send: async (message) => {
      transport ??= import('nodemailer').then(({ createTransport }) => createTransport(settings.smtpUrl))
      await (await transport).sendMail({ from: settings.from, ...message })
    },
  }
}
