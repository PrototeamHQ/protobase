import { getSchema } from 'better-auth/db'
import type { AdminAuth } from './create-auth'

/** The schema the admin store lives in; the search path decides when its options name none. */
export const storeSchema = ({ options: { database } }: AdminAuth): string | undefined => (database && 'schemaName' in database ? database.schemaName : undefined)

/** The admin store's tables with every plugin the project's auth has, which the assistant's queries must never read. */
export const authStoreTables = (auth: AdminAuth) => Object.keys(getSchema(auth.options)).map((name) => ({ schema: storeSchema(auth), name }))
