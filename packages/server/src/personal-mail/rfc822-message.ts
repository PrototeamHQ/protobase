import type { MailMessage } from '../mail/smtp-mailer'
import { composerMessage } from '../mail/composer-message'
import type { MailFrom } from './personal-mail-provider'

/**
 * `message` as an RFC 5322 message, attachments and all, the way the SMTP mailer composes it, with Nodemailer's
 * composer. Without `from`, the provider fills in the From header with the mailbox it sends from; with a name, the
 * header names it beside the address, quoted or encoded as it needs.
 */
export const rfc822Message = async (message: MailMessage, from?: MailFrom) => {
  const { default: MailComposer } = await import('nodemailer/lib/mail-composer')
  const sender = from && (from.name ? { name: from.name, address: from.address } : from.address)
  return new MailComposer({ ...(sender && { from: sender }), ...composerMessage(message) }).compile().build()
}
