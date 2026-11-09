import type { MailSenderRow, MailSenderStore } from './sender-store'

/** The store over `rows` alone, for tests of what sending does with them; `sharers` as `sharersFor` answers, default everyone. */
export const senderRows = (rows: MailSenderRow[] = [], sharers: MailSenderStore['sharersFor'] = async () => 'everyone'): MailSenderStore => ({
  ofUser: async (userId) => rows.filter((row) => row.userId === userId),
  shared: async () => rows.filter((row) => row.shared),
  sharedAs: async (address) => rows.filter((row) => row.shared && row.address === address),
  sharersFor: sharers,
})
