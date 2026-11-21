import { APIError } from 'better-auth/api'
import type { Locale } from '@protobase/schema/internal'
import { messages } from '../locale/messages'
import type { FindMailSenderUse } from './mail-sender-use'

const text = messages('personal-mail')

/**
 * The refusal of a change that would leave records holding `address`. It names neither the records nor where they
 * are: they may be records the person cannot read, such as another organization's.
 */
export const mailSenderInUse = (address: string, locale: Locale) =>
  new APIError('CONFLICT', { code: 'MAIL_SENDER_IN_USE', message: text(locale)('MAIL_SENDER_IN_USE', { address }) })

/**
 * Whether an address is still held by records of the app, which the account page asks before an address goes: `set`
 * gives where records are found, as the app does once it is built, in place of what it had; `refuse` rejects with
 * `mailSenderInUse` while records hold the address, and lets everything go without an app.
 */
export const mailSenderUseCheck = () => {
  let find: FindMailSenderUse | undefined
  return {
    set: (found: FindMailSenderUse) => void (find = found),
    refuse: async (address: string, locale: Locale) => {
      if (find && (await find(address))) throw mailSenderInUse(address, locale)
    },
  }
}

export type MailSenderUseCheck = ReturnType<typeof mailSenderUseCheck>
