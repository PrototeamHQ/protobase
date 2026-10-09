import type { Kysely } from 'kysely'

/** The query layer is schema-agnostic: tables come from the resource model, not from generated types. */
export type Db = Kysely<any>

/** Quotes one identifier for use inside a to_regclass() argument. */
export const quoteIdent = (name: string) => `"${name.replaceAll('"', '""')}"`
