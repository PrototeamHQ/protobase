import type { MailSenderRow, MailSenderStore } from './sender-store'

const verifiedTime = (row: MailSenderRow) => (row.verifiedAt ? new Date(row.verifiedAt).getTime() : 0)

/**
 * The store over `rows` alone, for tests of what sending does with them: `peers` names the people each person shares an
 * organization with, themselves left out; without, everyone is a peer, as in an app without organizations.
 */
export const senderRows = (rows: MailSenderRow[] = [], peers?: Record<string, string[]>): MailSenderStore => ({
  ofUser: async (userId) => rows.filter((row) => row.userId === userId),
  sharedWith: async (userId) =>
    rows
      .filter((row) => row.userId !== userId && row.shared && row.verifiedAccountId && (!peers || peers[userId]?.includes(row.userId)))
      .toSorted((a, b) => verifiedTime(b) - verifiedTime(a)),
})
