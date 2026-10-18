import pg from 'pg'

// node-postgres's own param conversion, which @types/pg leaves out.
const { prepareValue } = (pg as unknown as { utils: { prepareValue: (value: unknown) => string | Buffer | null } }).utils

// What a query returns, as Postgres sent it: text, before any type parser. A recording keeps this, so replay parses it
// as the app's own driver would.
export type Column = [name: string, oid: number]
export type RawResult = { command: string; rowCount: number | null; columns: Column[]; rows: (string | null)[][] }
/** A param as node-postgres sends it: text, or bytes kept as hex. */
export type RawParam = string | null | { hex: string }

// As the apps' Kysely parses them (packages/cli/src/project/pg-db.ts): date and timestamp without a zone stay text.
const parser = (oid: number) => (oid === 1082 || oid === 1114 ? (value: string) => value : pg.types.getTypeParser(oid, 'text'))

/** The result node-postgres would have handed the app. */
export const parseResult = (raw: RawResult) => {
  const parsers = raw.columns.map(([, oid]) => parser(oid))
  const rows = raw.rows.map((values) => {
    const row: Record<string, unknown> = {}
    raw.columns.forEach(([name], i) => {
      row[name] = values[i] === null ? null : parsers[i]!(values[i]!)
    })
    return row
  })
  const fields = raw.columns.map(([name, dataTypeID]) => ({ name, dataTypeID }))
  return { command: raw.command, rowCount: raw.rowCount, rows, fields }
}

export type ParsedResult = ReturnType<typeof parseResult>

/** Params as node-postgres prepares them, in a form JSON keeps. */
export const prepareParams = (values: readonly unknown[]): RawParam[] =>
  values.map((value) => {
    const prepared = prepareValue(value)
    return Buffer.isBuffer(prepared) ? { hex: prepared.toString('hex') } : prepared
  })

/** A prepared param as node-postgres takes it back. */
export const sendable = (param: RawParam) => (param !== null && typeof param === 'object' ? Buffer.from(param.hex, 'hex') : param)

// The fields of a Postgres error that say what failed; `file`, `line` and `routine` name Postgres's own source.
const errorFields = ['severity', 'code', 'detail', 'hint', 'position', 'internalPosition', 'internalQuery', 'where', 'schema', 'table', 'column', 'dataType', 'constraint'] as const

export type RawError = { message: string } & Partial<Record<(typeof errorFields)[number], string>>

export const isDatabaseError = (error: unknown): error is InstanceType<typeof pg.DatabaseError> => error instanceof pg.DatabaseError

export const rawError = (error: InstanceType<typeof pg.DatabaseError>): RawError => {
  const raw: RawError = { message: error.message }
  for (const field of errorFields) if (error[field] !== undefined) raw[field] = error[field]
  return raw
}

/** The error node-postgres would have thrown. */
export const databaseError = (raw: RawError) => {
  const error = new pg.DatabaseError(raw.message, 0, 'error')
  for (const field of errorFields) if (raw[field] !== undefined) error[field] = raw[field] as never
  return error
}
