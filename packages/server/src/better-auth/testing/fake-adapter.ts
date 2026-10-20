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
