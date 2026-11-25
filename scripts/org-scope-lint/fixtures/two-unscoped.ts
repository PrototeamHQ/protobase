import { unscoped } from '@protobase/query'
import { sql, type Kysely } from 'kysely'

// unscoped() in a comment is no use.
export const count = (db: Kysely<any> & { unscoped: (reason: string) => Kysely<any> }) =>
  sql`select count(*) from ${unscoped('the nightly count reads every organization', 'auth.member')}`.execute(db.unscoped('the nightly count reads every organization'))
