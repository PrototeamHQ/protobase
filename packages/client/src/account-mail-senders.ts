import { authError } from './auth-error'
import type { BetterAuthClient } from './better-auth-client'

/**
 * A From address the person entered for the mailbox they linked, such as a send-as address of their Gmail, theirs
 * alone: the display name the From header shows beside it, if any; its own signature, else the generic one applies; and
 * whether mail goes out from it when the app names no address.
 */
export type MailSender = { id: string; address: string; name?: string; signature?: string; isDefault: boolean }

/**
 * The person's From addresses, their mailbox's own address when its link names it, and whether the app can check that
 * mail from an address really goes out from it (`checkMailSender`).
 */
export type MailSenders = { address?: string; senders: MailSender[]; checks?: boolean }

/**
 * Where a check of a From address stands: its test message is on its way (`check` names it), arrived from that
 * address, arrived from another address (`from`), as when the mailbox does not have it set up, or the app cannot check.
 */
export type MailSenderCheck = { status: 'waiting'; check: string } | { status: 'confirmed'; from: string } | { status: 'mismatch'; from: string } | { status: 'unchecked' }

/** What changes of an address: `name: null` drops its name; `signature: null` drops its own, so the generic one applies. */
export type MailSenderChange = { name?: string | null; signature?: string | null; isDefault?: boolean }

/** The signed-in person's From addresses, on an app with personal mail (`personalMail` in its status). */
export const accountMailSenders = (client: BetterAuthClient) => ({
  /** The person's addresses, oldest first, with their mailbox's own. */
  mailSenders: async (): Promise<MailSenders> => {
    const { data, error } = await client.$fetch<MailSenders>('/account/mail-senders')
    if (error || !data) throw authError(error, 'Could not read your From addresses')
    return data
  },

  /** Enters an address. */
  addMailSender: async (input: { address: string; name?: string; signature?: string }): Promise<MailSender> => {
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

  /** Sends a test message from an address through the person's mailbox, to see the From it arrives with. */
  checkMailSender: async (id: string): Promise<MailSenderCheck> => {
    const { data, error } = await client.$fetch<MailSenderCheck>('/account/mail-senders/check', { method: 'POST', body: { id } })
    if (error || !data) throw authError(error, 'Could not check the From address')
    return data
  },

  /** Where the check `check` of an address stands: `waiting` until its test message arrived. */
  mailSenderCheckResult: async (id: string, check: string): Promise<MailSenderCheck> => {
    const { data, error } = await client.$fetch<{ status: 'waiting' } | MailSenderCheck>('/account/mail-senders/check-result', { method: 'POST', body: { id, check } })
    if (error || !data) throw authError(error, 'Could not check the From address')
    return data.status === 'waiting' ? { status: 'waiting', check } : data
  },
})
