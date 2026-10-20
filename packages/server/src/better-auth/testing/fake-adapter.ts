import type { AuthContext } from '../organizations/store'

type Row = Record<string, unknown>
type Where = { field: string; value: unknown; operator?: string }

const matches = (row: Row, where: Where[] = []) =>
  where.every(({ field, value, operator }) => (operator === 'in' ? (value as unknown[]).includes(row[field]) : row[field] === value))

/**
 * An in-memory store behind the part of Better Auth's adapter the auth code uses: `findOne`, `findMany`, `count` and
 * `deleteMany` with equality and `in` conditions, on rows named by Better Auth's models and fields. `tables` holds the
 * rows, so a test reads what is left.
 */
export const fakeAdapter = (tables: Record<string, Row[]> = {}) => {
  const rows = (model: string) => (tables[model] ??= [])
  const adapter = {
    findOne: async ({ model, where }: { model: string; where: Where[] }) => rows(model).find((row) => matches(row, where)) ?? null,
    findMany: async ({ model, where }: { model: string; where?: Where[] }) => rows(model).filter((row) => matches(row, where)),
    count: async ({ model, where }: { model: string; where?: Where[] }) => rows(model).filter((row) => matches(row, where)).length,
    deleteMany: async ({ model, where }: { model: string; where: Where[] }) => {
      const kept = rows(model).filter((row) => !matches(row, where))
      const deleted = rows(model).length - kept.length
      tables[model] = kept
      return deleted
    },
  }
  return { tables, adapter: adapter as unknown as AuthContext['adapter'] }
}

/**
 * An auth context over `fakeAdapter`: its `adapter`, the part of the `internalAdapter` the auth code reads (a user's
 * accounts and the user), and `hasPlugin`, true for the plugins named.
 */
export const fakeContext = (tables: Record<string, Row[]> = {}, plugins: string[] = []) => {
  const store = fakeAdapter(tables)
  const context = {
    adapter: store.adapter,
    internalAdapter: {
      findAccounts: async (userId: string) => (store.tables.account ?? []).filter((row) => row.userId === userId),
      findUserById: async (id: string) => (store.tables.user ?? []).find((row) => row.id === id) ?? null,
    },
    hasPlugin: (id: string) => plugins.includes(id),
  }
  return { tables: store.tables, context: context as unknown as AuthContext }
}
