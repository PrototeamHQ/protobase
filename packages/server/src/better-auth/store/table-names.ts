import { storeMigrations } from './migrations'
import { migrationsTableName } from './migrations-table'

/**
 * The admin store's tables besides the user table, whose name the app may configure: every feature's, which the store
 * has whether the app turns the feature on or not, and the record of its migrations.
 */
export const storeTableNames = [...storeMigrations.flatMap((migration) => migration.tables), migrationsTableName]
