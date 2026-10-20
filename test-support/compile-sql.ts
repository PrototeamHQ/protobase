import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler, type RawBuilder } from 'kysely'

// Compiles SQL as Kysely sends it to Postgres, connecting to nothing: for the unit tests of SQL builders.
const db = new Kysely<unknown>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (kysely) => new PostgresIntrospector(kysely),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
})

export const compiled = (builder: RawBuilder<unknown>) => {
  const { sql, parameters } = builder.compile(db)
  return { sql, parameters }
}
