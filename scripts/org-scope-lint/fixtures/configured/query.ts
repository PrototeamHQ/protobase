import { sql } from 'kysely'

export const members = sql`select * from people.memberships`
export const invitations = sql`select * from people.app_invitation`
