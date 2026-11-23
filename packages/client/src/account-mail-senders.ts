import { authError } from './auth-error'
import type { BetterAuthClient } from './better-auth-client'

/**
 * Where a From address stands: `verified` when the mailbox's provider says it may send as it; `pending` while the
 * person still has to confirm it with the provider; `failed` when the provider's last listing did not hold it, so mail
 * from it would go out from another address; `unverified` when nothing says either way, as on a mailbox that cannot
 * list its send-as addresses; `detached` when it is on no mailbox they can send through.
 */
export type MailSenderState = 'unverified' | 'pending' | 'verified' | 'failed' | 'detached'

/**
 * A From address of the person's, theirs alone, on one of their mailbox connections (`connection`, none when
 * detached): typed by them or listed by the mailbox's provider, such as a send-as address of their Gmail. The display
 * name the From header shows beside it, if any; its own signature, else the generic one applies; whether mail goes out
 * from it when the app names no address; its `state`; and when the provider's last listing held it (`listedAt`).
 */
export type MailSender = { id: string; address: string; name?: string; signature?: string; isDefault: boolean; state: MailSenderState; connection?: string; listedAt?: string }

/**
 * A mailbox connection of the person's: its provider, such as `gmail`, its own address when its link names it,
 * whether its provider can list its send-as addresses, and the scopes the app adds to the link that it lacks, so
 * connecting it again lets it list them.
 */
export type MailConnection = { id: string; provider: string; address?: string; canList: boolean; missingScopes: string[] }

/**
 * The person's From addresses, their mailbox's own address when its link names it, their mailbox connections, and
 * whether the app can check that mail from an address really goes out from it (`checkMailSender`).
 */
export type MailSenders = { address?: string; senders: MailSender[]; connections?: MailConnection[]; checks?: boolean }

/**
 * How a refresh of one connection went: `listed`, its send-as addresses are read; `not_permitted`, its link lacks
 * `missing_scopes`, so connecting it again lets it list; `error`, `link_expired` or `listing_failed`, changing nothing.
 */
export type MailConnectionListing = { connection: string; provider: string } & (
  | { status: 'listed' }
  | { status: 'not_permitted'; missing_scopes: string[] }
  | { status: 'error'; code: 'link_expired' | 'listing_failed' }
)

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

  /** Types an address, on `connection` or else the mailbox mail goes through: `unverified` until its provider lists it. */
  addMailSender: async (input: { address: string; name?: string; signature?: string; connection?: string }): Promise<MailSender> => {
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

  /** Reads the send-as addresses of each of the person's mailboxes whose provider can list them, and says how each went. */
  refreshMailSenders: async (): Promise<MailConnectionListing[]> => {
    const { data, error } = await client.$fetch<{ connections: MailConnectionListing[] }>('/account/mail-senders/refresh', { method: 'POST', body: {} })
    if (error || !data) throw authError(error, 'Could not read your send-as addresses')
    return data.connections
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
