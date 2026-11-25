import { sql } from 'kysely'

export const table = sql.raw('auth.member')
export const either = (all: boolean) => sql.raw(all ? 'auth.invitation' : 'public.member')
export const reference = sql.ref('auth.personal_access_token.id')
