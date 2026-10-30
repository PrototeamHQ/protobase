import type { MailMessage } from '../mail/smtp-mailer'
import { composerMessage } from '../mail/composer-message'

/**
 * `message` as an RFC 5322 message, attachments and all, the way the SMTP mailer composes it, with Nodemailer's
 * composer. Without `from`, the provider fills in the From header with the mailbox it sends from.
 */
export const rfc822Message = async (message: MailMessage, from?: string) => {
  const { default: MailComposer } = await import('nodemailer/lib/mail-composer')
  return new MailComposer({ ...(from && { from }), ...composerMessage(message) }).compile().build()
}
