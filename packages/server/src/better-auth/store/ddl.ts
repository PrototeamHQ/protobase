import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler, sql, type RawBuilder } from 'kysely'

// The auth store's migrations as SQL text, with Kysely's `sql` tag doing the quoting. Kysely makes every interpolated
// value a parameter, which a migration file cannot have, so `ddl` makes each string an identifier instead. A literal
// goes through `sql.lit`, raw SQL through `sql.raw`, and a qualified name through `sql.id(schema, table)`.

/** A part of a `ddl` template: a string is an identifier, quoted; a fragment (`ddl`, `sql.lit`, `sql.id`, ...) is kept as it is. */
export type DdlPart = string | RawBuilder<unknown>

/** A fragment of SQL whose strings are identifiers: `ddl\`create table ${'user'} (...)\`` is `create table "user" (...)`. */
export const ddl = (strings: TemplateStringsArray, ...parts: DdlPart[]) => sql<unknown>(strings, ...parts.map((part) => (typeof part === 'string' ? sql.id(part) : part)))

// Only compiles: it has no connection.
const compiler = new Kysely<never>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
})

/** The text of a fragment. One that holds a parameter, a value given as neither identifier nor `sql.lit`, is an error. */
export const ddlText = (fragment: RawBuilder<unknown>) => {
  const { sql: text, parameters } = fragment.compile(compiler)
  if (parameters.length > 0) throw new Error(`A migration statement has no parameters; give each value with sql.lit: ${text}`)
  return text
}
