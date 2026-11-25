import { sql } from 'kysely'

export const members = sql`select * from auth.member`
export const invitations = sql<{ id: string }>`select id from "auth" . "invitation" where status = 'pending'`
export const tokens = sql`delete from personal_access_token where id = ${1}`
