import * as z from 'zod'
import type { PersonalMail } from '../personal-mailer'
import type { VerificationMessage, VerifyTools } from './sender-address-verifier'

const message = z.object({ to: z.email(), subject: z.string().min(1).max(998), text: z.string(), html: z.string().optional() })

/**
 * The tools of one `verify` of the address record `senderId`: `send` goes through `mail`, its owner's mailbox, From that
 * record, to one recipient, once. Only `to`, `subject`, `text` and `html` are read, so a From, a Sender, copies, header
 * fields or attachments a verifier passes never reach the message.
 */
export const verifyTools = (mail: PersonalMail, senderId: string): VerifyTools => {
  let sent = false
  return {
    send: async (given: VerificationMessage) => {
      if (sent) throw new Error('A verification sends one test message; verify called tools.send again')
      const { to, subject, text, html } = message.parse(given)
      sent = true
      await mail.send({ sender_address_id: senderId, to, subject, text, ...(html !== undefined && { html }) })
    },
  }
}
