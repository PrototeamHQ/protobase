import type { Locale } from '@protobase/schema/internal'
import { messages } from '../locale/messages'
import type { MailCheckService } from './mail-check-service'
import type { PersonalMail } from './personal-mailer'

const text = messages('personal-mail')

/** Where a check of a From address stands: its test message has not arrived yet, or arrived from that address, or from another. */
export type AliasCheckResult = { status: 'waiting' } | { status: 'confirmed'; from: string } | { status: 'mismatch'; from: string }

/**
 * Checks that mail sent from a From address really goes out from it, as a mailbox such as Gmail sends from its own
 * address without an error when the address is not one of its verified send-as addresses: `start` sends a test
 * message from the From address record `sender` through `userId`'s mailbox to a one-time address of the mail check service and answers its
 * token; `result` compares the From the message arrived with to `address`, without regard to case.
 */
export type AliasChecks = {
  start: (userId: string, sender: { id: string; address: string }, locale: Locale) => Promise<string>
  result: (token: string, address: string) => Promise<AliasCheckResult>
}

export const aliasChecks = (service: MailCheckService, mailOf: (userId: string) => PersonalMail): AliasChecks => ({
  start: async (userId, { id, address }, locale) => {
    const { token, address: to } = await service.issue()
    const say = text(locale)
    await mailOf(userId).send({ sender_address_id: id, to, subject: say('ALIAS_CHECK_SUBJECT', { address }), text: say('ALIAS_CHECK_TEXT', { address }) })
    return token
  },
  result: async (token, address) => {
    const from = await service.received(token)
    if (from === undefined) return { status: 'waiting' }
    return from.toLowerCase() === address.toLowerCase() ? { status: 'confirmed', from } : { status: 'mismatch', from }
  },
})
