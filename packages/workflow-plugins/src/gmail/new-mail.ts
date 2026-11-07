import type { PollingTrigger, TriggerContext, TriggerItem } from '@protobase/workflows/plugin'
import { gmailApi, GmailNotFound, type GmailApi } from './api'
import { historyPage, labels, messagesPage, profile, type MessageRef } from './calls'
import { labelId, readCursor, type GmailCursor, type LiveCursor, type RecoveryCursor } from './cursor'
import { passes, type MailFilters } from './filters'
import { walkHistory } from './history-walk'
import { boundItem } from './item-bounds'
import { readMessage } from './read-message'

/** The most mails one poll reads: 90 raw reads and a history call stay within a mailbox's quota for one minute. */
export const mailsPerPoll = 90

const filterText = { type: 'string', minLength: 1, maxLength: 500 }

const seconds = (time: Date) => Math.floor(time.getTime() / 1000)

// The label the trigger watches, by id or by name, as the mailbox lists it.
const findLabel = async (api: GmailApi, wanted: string) => {
  const label = (await labels(api)).find(({ id, name }) => id === wanted || name === wanted)
  if (!label) throw new Error(`The mailbox has no label "${wanted}"`)
  if (!labelId.test(label.id)) throw new Error('Gmail labels.list answered an unexpected shape')
  return label.id
}

const filtersOf = (input: Record<string, unknown>): MailFilters => ({
  ...(typeof input.from === 'string' && { from: input.from }),
  ...(typeof input.to === 'string' && { to: input.to }),
  ...(typeof input.subject === 'string' && { subject: input.subject }),
})

// The runs of the messages taken, one at a time: each read counts toward the poll's limit, passing the filters or not.
const itemsOf = async (api: GmailApi, taken: MessageRef[], filters: MailFilters) => {
  const items: TriggerItem[] = []
  const seen = new Set<string>()
  for (const ref of taken) {
    if (seen.has(ref.id)) continue
    seen.add(ref.id)
    const item = await readMessage(api, ref)
    if (item && passes(item, filters)) items.push({ key: ref.id, data: boundItem(item) })
  }
  return items
}

// The history after the cursor, or a recovery's start once Google no longer keeps it (404).
const historyPoll = async (api: GmailApi, cursor: LiveCursor, filters: MailFilters, limit: number, due: Date) => {
  const read = (page: string | undefined) => historyPage(api, { start: cursor.history_id, label: cursor.label_id, page })
  const walked = await walkHistory(read, cursor.history_id, cursor.offset, limit).catch((error: unknown) => {
    if (error instanceof GmailNotFound) return
    throw error
  })
  if (!walked) {
    const recovery: RecoveryCursor = { label_id: cursor.label_id, polled_at: cursor.polled_at, recovery: { since: cursor.polled_at, page_token: null, resume_history_id: await profile(api) } }
    return { items: [], cursor: recovery }
  }
  // `polled_at` moves on only once the history is read to its end, so a recovery never skips mail not yet taken.
  const next: LiveCursor = { label_id: cursor.label_id, history_id: walked.history_id, offset: walked.offset, polled_at: walked.caughtUp ? seconds(due) : cursor.polled_at }
  return { items: await itemsOf(api, walked.taken, filters), cursor: next }
}

// One page of the mail on the label after the last full read of the history, then the history again.
const recoveryPoll = async (api: GmailApi, cursor: RecoveryCursor, filters: MailFilters, limit: number) => {
  const { since, page_token: page, resume_history_id: resume } = cursor.recovery
  const listed = await messagesPage(api, { label: cursor.label_id, since, page: page ?? undefined, limit })
  const items = await itemsOf(api, listed.messages.slice(0, limit), filters)
  const next: GmailCursor = listed.next
    ? { ...cursor, recovery: { ...cursor.recovery, page_token: listed.next } }
    : { label_id: cursor.label_id, history_id: resume, offset: 0, polled_at: cursor.polled_at }
  return { items, cursor: next }
}

const api = (origin: string, { fetch, connection, signal }: TriggerContext) => gmailApi({ origin, fetch, connection, signal })

/**
 * `gmail:new_mail`: one run per new mail on a label of the connected mailbox, from the time the trigger is turned on,
 * read with read-only access by polling the mailbox's history every minute. Google answers at `origin`.
 */
export const newMailTrigger = (origin: string): PollingTrigger => ({
  kind: 'polling',
  label: 'New mail',
  description: 'Starts one run for each new mail on a label of a connected mailbox, INBOX by default, that passes the filters set.',
  connection: 'google',
  input: {
    type: 'object',
    additionalProperties: false,
    properties: {
      label: { type: 'string', minLength: 1, maxLength: 225, description: 'the label to watch, by name or id; default INBOX' },
      from: { ...filterText, description: "only mail whose sender's name or address contains this, in any case" },
      to: { ...filterText, description: "only mail with a To or Cc recipient whose name or address contains this, in any case" },
      subject: { ...filterText, description: 'only mail whose subject contains this, in any case' },
    },
  },
  output: { type: 'object', description: '{ message_id, thread_id, from, to, cc, subject, date, text, html, attachments: [{ filename, content_type, size }], truncated }' },
  every: '1 minute',
  limit: mailsPerPoll,
  start: async (context) => {
    const gmail = api(origin, context)
    const label = await findLabel(gmail, typeof context.input.label === 'string' ? context.input.label : 'INBOX')
    const first: LiveCursor = { label_id: label, history_id: await profile(gmail), offset: 0, polled_at: seconds(new Date()) }
    return first
  },
  poll: async (context) => {
    const gmail = api(origin, context)
    const cursor = readCursor(context.cursor)
    const filters = filtersOf(context.input)
    return 'recovery' in cursor ? recoveryPoll(gmail, cursor, filters, context.limit) : historyPoll(gmail, cursor, filters, context.limit, context.due)
  },
})
