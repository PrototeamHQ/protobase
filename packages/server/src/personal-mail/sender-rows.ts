import type { MailSenderRow, MailSenderStore } from './sender-store'

const key = (address: string) => address.trim().toLowerCase()

/** The store over `rows` in memory, written as the SQL store writes, for tests of what sending does with them. */
export const senderRows = (rows: MailSenderRow[] = []): MailSenderStore & { rows: MailSenderRow[] } => {
  let made = 0
  const own = (userId: string, id: string) => rows.find((row) => row.id === id && row.userId === userId)
  return {
    rows,
    ofUser: async (userId) => rows.filter((row) => row.userId === userId).map((row) => ({ ...row })),
    type: async (sender, at) => {
      const found = rows.find((row) => row.connectionId === sender.connectionId && key(row.address) === key(sender.address))
      const typedAt = found?.removedAt && found.removedAt >= at ? new Date(found.removedAt.getTime() + 1) : at
      if (found) return { ...Object.assign(found, { typedAt, name: sender.name, signature: sender.signature }) }
      const row: MailSenderRow = { id: `typed-${++made}`, ...sender, shared: false, isDefault: false, createdAt: at, typedAt: at, listedAt: null, providerState: null, providerStateReadAt: null, removedAt: null }
      rows.push(row)
      return { ...row }
    },
    recordListing: async (userId, connectionId, listed, readAt) => {
      for (const { address, provider_state } of listed) {
        const evidence = { listedAt: readAt, providerState: provider_state ?? null, providerStateReadAt: readAt }
        const found = rows.find((row) => row.connectionId === connectionId && key(row.address) === key(address))
        if (found && found.providerStateReadAt && found.providerStateReadAt > readAt) continue
        if (found) Object.assign(found, evidence)
        else rows.push({ id: `listed-${++made}`, userId, connectionId, address, name: null, shared: false, signature: null, isDefault: false, createdAt: readAt, typedAt: null, removedAt: null, ...evidence })
      }
      const keys = listed.map(({ address }) => key(address))
      for (const row of rows) {
        if (row.connectionId !== connectionId || row.userId !== userId || keys.includes(key(row.address)) || (row.typedAt ?? row.createdAt) > readAt) continue
        if (row.providerStateReadAt && row.providerStateReadAt > readAt) continue
        Object.assign(row, { listedAt: null, providerState: null, providerStateReadAt: readAt })
      }
    },
    change: async (userId, id, change) => {
      const found = own(userId, id)
      return found && { ...Object.assign(found, Object.fromEntries(Object.entries(change).filter(([, value]) => value !== undefined))) }
    },
    clearDefault: async (userId) => {
      for (const row of rows) if (row.userId === userId) row.isDefault = false
    },
    remove: async (userId, id, at) => {
      const found = own(userId, id)
      if (found) Object.assign(found, { removedAt: at, isDefault: false })
    },
  }
}

/** A row as tests write one: an address typed on `connectionId` at `at`, nothing else said of it. */
export const typedRow = (row: Partial<MailSenderRow> & Pick<MailSenderRow, 'id' | 'userId' | 'address'>, at = new Date('2026-10-01T09:00:00Z')): MailSenderRow => ({
  connectionId: null,
  name: null,
  shared: false,
  signature: null,
  isDefault: false,
  createdAt: at,
  typedAt: at,
  listedAt: null,
  providerState: null,
  providerStateReadAt: null,
  removedAt: null,
  ...row,
})
