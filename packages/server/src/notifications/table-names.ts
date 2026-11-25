import type { StoreNames } from '../better-auth/store/store-names'
import { qualified } from './schema-sql'

// A notifications table's names as a schema module holds them (`ModuleNames`): its schema and table, each column under
// `column.<name>`, and the users table its user column points at with the type of their ids, as the auth store's own
// steps write them (`migrationNames`): `users` is empty without sign-in, and the user column is then text.

export type TableNames<C extends string> = { schema: string; table: string; columns: Record<C, string> }

/** The users table the notifications tables point at, and the type of their ids; none without sign-in. */
export type UsersTarget = { users: string; idType: string }

/** The auth store's users table, or the table that holds the user ids (`users.keyTable`), and the type of its ids. */
export const usersTarget = (store: StoreNames | undefined): UsersTarget => {
  if (!store) return { users: '', idType: 'text' }
  const users = store.users.keyTable ?? { schema: store.schema, table: store.names.table('user').name }
  return { users: qualified(users), idType: store.uuidIds ? 'uuid' : 'text' }
}

/** A table's names and the users it points at, as a module's names. */
export const moduleNames = <C extends string>({ schema, table, columns }: TableNames<C>, { users, idType }: UsersTarget) => ({
  schema,
  table,
  users,
  user_id_type: idType,
  ...Object.fromEntries(Object.entries(columns).map(([column, name]) => [`column.${column}`, name as string])),
})

/** The table's names and the users it points at from a module's names, for `columns`. */
export const tableNames = <C extends string>(names: Record<string, string>, columns: readonly C[]) => ({
  table: { schema: names.schema!, table: names.table!, columns: Object.fromEntries(columns.map((column) => [column, names[`column.${column}`]!])) as Record<C, string> },
  user: { type: names.user_id_type!, ...(names.users && { references: `${names.users} (id)` }) },
  users: names.users || undefined,
})
