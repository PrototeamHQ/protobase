import type { Kysely } from 'kysely'

export const every = (db: Kysely<any>) =>
  db.transaction().execute((trx) => trx.withoutPlugins().selectFrom('auth.member').selectAll().execute())
