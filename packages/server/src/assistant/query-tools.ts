import type { Db } from '@protobase/query'
import { runReadOnlyQuery, runReadWriteQuery, type QueryOptions, type QueryResult } from './run-query'
import { defineTool, type ToolContext } from './tools'

const maxResultLength = 20_000

const sqlParameter = (description: string) => ({ type: 'string', description })

// A statement Postgres refused (syntax, a missing column, a write in the read-only transaction) is the model's to fix.
const isDatabaseError = (error: unknown): error is Error => error instanceof Error && /^[0-9A-Z]{5}$/.test(String((error as { code?: unknown }).code))

const refused = (error: unknown) => {
  if (isDatabaseError(error)) return `Postgres refused the statement: ${error.message}`
  throw error
}

const shown = (result: QueryResult, statement: string, context: ToolContext) => {
  context.show({ type: 'table', id: crypto.randomUUID(), columns: result.columns, rows: result.rows, caption: statement, ...(result.truncated && { truncated: true }) })
  const json = JSON.stringify(result)
  return json.length > maxResultLength ? `${json.slice(0, maxResultLength)}... (cut off)` : json
}

const statementOf = (args: Record<string, unknown>) => (typeof args.sql === 'string' && args.sql.trim() ? args.sql : undefined)

/**
 * Lets the model read the app's database: one SELECT per call, in a read-only transaction (see `runReadOnlyQuery`).
 * The rows show as a table in the chat. It runs as the app's database role, outside Protobase's access rules.
 */
export const readOnlyQueryTool = (db: Db, options: QueryOptions = {}) =>
  defineTool({
    name: 'run_read_only_query',
    description: `Runs one PostgreSQL SELECT on the app's database in a read-only transaction and returns up to ${options.rowLimit ?? 200} rows as JSON ({ columns, rows, truncated }). The user sees the rows as a table. Use it to answer questions about the data. It cannot change anything.`,
    parameters: { type: 'object', properties: { sql: sqlParameter('One SELECT statement, without a trailing semicolon.') }, required: ['sql'] },
    run: async (args, context) => {
      const statement = statementOf(args)
      if (!statement) return 'Pass the statement as { "sql": "select ..." }.'
      return runReadOnlyQuery(db, statement, options).then((result) => shown(result, statement, context), refused)
    },
  })

/**
 * Lets the model change the app's database, never on its own: each call shows the statement on an approval card, and
 * only the user's Approve runs it, in a read-write transaction (see `runReadWriteQuery`). Reject, or no answer, runs nothing.
 */
export const readWriteQueryTool = (db: Db, options: QueryOptions = {}) =>
  defineTool({
    name: 'propose_write_query',
    description: 'Proposes one PostgreSQL INSERT, UPDATE or DELETE ending in a RETURNING clause. The user sees the statement and your summary and must approve it; only then it runs in a read-write transaction, and you get the returned rows as JSON, or the answer that it did not run. Use it only when the user asked for a change.',
    parameters: {
      type: 'object',
      properties: {
        sql: sqlParameter('One INSERT, UPDATE or DELETE with a RETURNING clause, without a trailing semicolon.'),
        summary: { type: 'string', description: 'What the statement changes, in one plain sentence for the user.' },
      },
      required: ['sql', 'summary'],
    },
    run: async (args, context) => {
      const statement = statementOf(args)
      if (!statement) return 'Pass the statement as { "sql": "update ... returning ...", "summary": "..." }.'
      const answer = await context.approve({ title: 'Run this change?', body: typeof args.summary === 'string' ? args.summary : undefined, code: statement })
      if (answer !== 'approved') return `The user did not approve the statement (${answer}); nothing ran.`
      return runReadWriteQuery(db, statement, options).then((result) => shown(result, statement, context), refused)
    },
  })
