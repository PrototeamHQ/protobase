import type { MailSenderRow, MailSenderStore } from './sender-store'

/** The store over `rows` alone, for tests of what sending does with them. */
export const senderRows = (rows: MailSenderRow[] = []): MailSenderStore => ({
  ofUser: async (userId) => rows.filter((row) => row.userId === userId),
})
