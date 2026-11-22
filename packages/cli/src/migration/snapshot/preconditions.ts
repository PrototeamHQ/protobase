import postgres from 'postgres'

// Postgres's code for a missing table.
const undefinedTable = '42P01'

/**
 * Runs the steps' checks against the database at `url`, in a read-only transaction: a check refuses when the rows
 * already there break what its step assumes, such as two accounts with one provider and account id.
 */
export const runPreconditions = async (url: string, checks: string[]) => {
  const sql = postgres(url, { max: 1, onnotice: () => {} })
  try {
    await sql.begin('read only', async (tx) => {
      for (const check of checks) await tx.unsafe(check)
    })
  } catch (error) {
    if ((error as { code?: string }).code !== undefinedTable) throw error
    throw new Error("The database lacks a table of the auth store that the snapshot has: apply the project's migrations to it first, or unset DATABASE_URL to write the migration without checking its rows")
  } finally {
    await sql.end()
  }
}
