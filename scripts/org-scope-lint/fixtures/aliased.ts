import * as k from 'kysely'
import { CompiledQuery as CQ, sql as q } from 'kysely'

export const table = q.raw('auth.member')
export const query = CQ.raw('select * from auth.invitation')
export const reference = k.sql.ref('auth.personal_access_token.id')
