import { APIError } from 'better-auth/api'
import type { FindMailSenderUse, MailSenderUse } from './mail-sender-use'

/** What a resource's records are called, one and several: its view's names, else the resource's name. */
export type ResourceNames = (resource: string) => { singular: string; plural: string }

const counted = (use: MailSenderUse, names: ResourceNames) => {
  const { singular, plural } = names(use.resource)
  return `${use.count} ${use.count === 1 ? singular : plural}`
}

/** The refusal of a change that would leave `use`'s records holding `address`, naming where it is held. */
export const mailSenderInUse = (address: string, use: MailSenderUse[], names: ResourceNames) =>
  new APIError('CONFLICT', {
    code: 'MAIL_SENDER_IN_USE',
    message: `${address} is still the From address of ${use.map((item) => counted(item, names)).join(', ')}. Give them another From address first.`,
    use,
  })

/**
 * Whether an address is still held by records of the app, which the account page asks before an address goes: `set`
 * gives where records are found and what they are called, as the app does once it is built, in place of what it had;
 * `refuse` rejects with `mailSenderInUse` while records hold the address, and lets everything go without an app.
 */
export const mailSenderUseCheck = () => {
  let check: { find: FindMailSenderUse; names: ResourceNames } | undefined
  return {
    set: (find: FindMailSenderUse, names: ResourceNames) => void (check = { find, names }),
    refuse: async (address: string) => {
      if (!check) return
      const use = await check.find(address)
      if (use.length > 0) throw mailSenderInUse(address, use, check.names)
    },
  }
}

export type MailSenderUseCheck = ReturnType<typeof mailSenderUseCheck>
