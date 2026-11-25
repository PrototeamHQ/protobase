import { scoped, unscoped } from '@protobase/query'
import { CompiledQuery, sql } from 'kysely'

export const members = sql`select * from ${scoped('auth.member')} as m`
export const everyMember = sql`select * from ${unscoped('the nightly count reads every organization', 'auth.member')}`
export const notTables = sql`select 'member' as role, m.member from public.member m -- auth.member`
export const commented = CompiledQuery.raw('/* auth.invitation */ select 1')
