import type { BuiltInTables } from './modules'

/**
 * `auth.tables`: the names the store's tables and columns get in the database, where the app wants others than the
 * built-in ones: a `prefix` before every table's name, and per table, by its built-in name, its own `name` and its
 * `columns`, each by its built-in name. A table the config names takes that name without the prefix; one it leaves out
 * keeps its built-in name, after the prefix. `id` keeps its name.
 *
 * ```ts
 * tables: { prefix: 'app_', user: { name: 'users', columns: { role: 'app_role' } } }
 * ```
 */
export type TableNames = { prefix?: string } & { [Table in keyof BuiltInTables]?: { name?: string; columns?: Partial<Record<BuiltInTables[Table], string>> } }
