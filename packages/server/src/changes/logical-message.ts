import { sql } from 'kysely'

/** The prefix of the message every API write transaction emits with who wrote, as the change stream reads it. */
export const actorPrefix = 'protobase_actor'

/** The prefix of the message emitted for each command a schema change runs (`ddl_command_end`). */
export const ddlPrefix = 'protobase_ddl'

/** The prefix of the message emitted for each object a schema change drops (`sql_drop`). */
export const dropPrefix = 'protobase_drop'

/**
 * A transactional logical decoding message, as an expression of a select: it reaches the WAL with the transaction's
 * rows, in their order, and only when the transaction commits. The `text` cast picks the text overload over bytea's.
 */
export const emitMessage = (prefix: string, content: string) => sql`pg_logical_emit_message(true, ${prefix}, ${content}::text)`

/** The same message in the SQL of a function body: `content` is an SQL expression of type text. */
export const emitMessageSql = (prefix: string, content: string) => `pg_logical_emit_message(true, '${prefix}', ${content})`
