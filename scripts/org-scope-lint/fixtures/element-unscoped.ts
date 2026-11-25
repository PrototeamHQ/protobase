import type { Kysely } from 'kysely'

export const every = (db: Kysely<any> & { unscoped: (reason: string) => Kysely<any> }) => db['unscoped']('cross-organization maintenance')
