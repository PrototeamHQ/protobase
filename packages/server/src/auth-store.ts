import { resolveNames } from './better-auth/names/resolve-names'
import { storeTableNamesOf } from './better-auth/store/table-names'

// The admin store's built-in table names alone, for the CLI commands that must leave the store out without loading
// the server or the project's config.

/** The store's tables besides the user table, under their built-in names. */
export const storeTableNames = storeTableNamesOf(resolveNames({ schema: undefined }))

/** The records of the store's steps, `auth_steps`, and of the versions a store recorded before it, under their built-in names. */
export const storeRecordNames = [resolveNames({ schema: undefined }).table('auth_steps').name, resolveNames({ schema: undefined }).table('auth_migrations').name]
