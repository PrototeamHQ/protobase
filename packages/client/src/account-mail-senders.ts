import { authError } from './auth-error'
import type { BetterAuthClient } from './better-auth-client'

/**
 * A From address the person entered for the mailbox they linked, such as a send-as address of their Gmail: shared with
 * others in the app who send mail, or theirs alone; its own signature, else the generic one applies; and whether
 * mail goes out from it when the app names no address.
 */
export type MailSender = { id: string; address: string; shared: boolean; signature?: string; isDefault: boolean }

/** The person's From addresses, and their mailbox's own address when its link names it. */
export type MailSenders = { address?: string; senders: MailSender[] }

/** What changes of an address: `signature: null` drops its own, so the generic one applies. */
export type MailSenderChange = { shared?: boolean; signature?: string | null; isDefault?: boolean }

/** The signed-in person's From addresses, on an app with personal mail (`personalMail` in its status). */
export const accountMailSenders = (client: BetterAuthClient) => ({
  /** The person's addresses, oldest first, with their mailbox's own. */
  mailSenders: async (): Promise<MailSenders> => {
    const { data, error } = await client.$fetch<MailSenders>('/account/mail-senders')
    if (error || !data) throw authError(error, 'Could not read your From addresses')
    return data
  },

  /** Enters an address, private unless `shared`. */
  addMailSender: async (input: { address: string; shared?: boolean; signature?: string }): Promise<MailSender> => {
    const { data, error } = await client.$fetch<{ sender: MailSender }>('/account/mail-senders/add', { method: 'POST', body: input })
    if (error || !data) throw authError(error, 'Could not add the From address')
    return data.sender
  },

  /** Changes an address; `isDefault: true` makes it the default in place of any other. */
  updateMailSender: async (id: string, change: MailSenderChange): Promise<MailSender> => {
    const { data, error } = await client.$fetch<{ sender: MailSender }>('/account/mail-senders/update', { method: 'POST', body: { id, ...change } })
    if (error || !data) throw authError(error, 'Could not change the From address')
    return data.sender
  },

  /** Removes an address: mail no longer goes out from it. */
  removeMailSender: async (id: string) => {
    const { error } = await client.$fetch('/account/mail-senders/remove', { method: 'POST', body: { id } })
    if (error) throw authError(error, 'Could not remove the From address')
  },
})
